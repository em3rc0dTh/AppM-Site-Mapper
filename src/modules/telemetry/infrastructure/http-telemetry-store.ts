import type {
  TelemetryHistoryWriter,
  TelemetryHistoryWriterDiagnostics,
} from '@/modules/telemetry/application/telemetry-history-writer';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type {
  TelemetryHistoryPoint,
  TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { logger } from '@/shared/infrastructure/logger';
import { isProductionDeployment } from '@/config/env';

export interface SerializedTelemetryStoreReading {
  readonly shelfId: string;
  readonly frameId: string;
  readonly panelId: string;
  readonly breakerId: string;
  readonly rawPointId: string;
  readonly observedAt: string;
  readonly state?: string;
  readonly voltageV?: number;
  readonly currentA?: number;
  readonly powerW?: number;
  readonly energyKwh?: number;
}

export interface SerializedTelemetryStoreSample {
  readonly sourceIdentity: string;
  readonly deviceId: string;
  readonly receivedAt: string;
  readonly messageId?: string;
  readonly readings: readonly SerializedTelemetryStoreReading[];
}

function readingObservedAt(sample: TelemetrySample, index: number): string {
  const reading = sample.breakerReadings?.[index];
  return (
    reading?.metrics.voltageV?.observedAt ??
    reading?.metrics.currentA?.observedAt ??
    reading?.metrics.powerW?.observedAt ??
    reading?.metrics.energyKwh?.observedAt ??
    reading?.state?.observedAt ??
    sample.sourceObservedAt ??
    sample.receivedAt
  );
}

export function serializeTelemetryStoreSample(
  sample: TelemetrySample,
): SerializedTelemetryStoreSample | null {
  const readings = (sample.breakerReadings ?? []).flatMap((reading, index) => {
    const hasMetric = Boolean(
      reading.metrics.voltageV ||
      reading.metrics.currentA ||
      reading.metrics.powerW ||
      reading.metrics.energyKwh,
    );
    if (!hasMetric) return [];

    return [
      {
        shelfId: reading.shelfId,
        frameId: reading.frameId,
        panelId: reading.panelId,
        breakerId: reading.breakerId,
        rawPointId: reading.rawPointId,
        observedAt: readingObservedAt(sample, index),
        ...(reading.state ? { state: reading.state.value } : {}),
        ...(reading.metrics.voltageV ? { voltageV: reading.metrics.voltageV.value } : {}),
        ...(reading.metrics.currentA ? { currentA: reading.metrics.currentA.value } : {}),
        ...(reading.metrics.powerW ? { powerW: reading.metrics.powerW.value } : {}),
        ...(reading.metrics.energyKwh ? { energyKwh: reading.metrics.energyKwh.value } : {}),
      } satisfies SerializedTelemetryStoreReading,
    ];
  });

  if (!readings.length) return null;

  return {
    sourceIdentity: sample.sourceIdentity,
    deviceId: sample.breakerReadings?.[0]?.deviceId ?? sample.entityId,
    receivedAt: sample.receivedAt,
    ...(sample.messageId ? { messageId: sample.messageId } : {}),
    readings,
  };
}

export class HttpTelemetryStore implements TelemetryHistoryWriter {
  private writes = 0;
  private rowsAccepted = 0;
  private failures = 0;
  private lastWriteAt: string | null = null;
  private lastError: string | null = null;
  private lastSnmpDisposition: 'committed' | 'already_committed' | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly accessToken?: string,
  ) {}


  snmpCommitDisposition(): 'committed' | 'already_committed' | null {
    return this.lastSnmpDisposition;
  }

  async commitSnmpBatch(
    sourceIdentity: string,
    observedAt: string,
    samples: readonly TelemetrySample[],
  ): Promise<'committed' | 'already_committed'> {
    if (!samples.length || samples.length > 64) throw new Error('INVALID_SNMP_BATCH');
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/snmp-batch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: JSON.stringify({ sourceIdentity, observedAt, samples }),
      cache: 'no-store',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = (await response.json()) as {
      error?: string;
      status?: string;
      acceptedFeeds?: number;
    };
    if (!response.ok) {
      this.failures += 1;
      if (
        response.status === 409 &&
        (result.error === 'SNMP_BATCH_TAMPERED' ||
          result.error === 'OUT_OF_ORDER_SNMP_SAMPLE')
      ) throw new Error(result.error);
      throw new Error(`SNMP_BATCH_HTTP_${response.status}`);
    }
    if (
      result.acceptedFeeds !== samples.length ||
      (result.status !== 'committed' && result.status !== 'already_committed')
    ) {
      this.failures += 1;
      throw new Error('SNMP_BATCH_INVALID_ACK');
    }
    this.writes += 1;
    if (result.status === 'committed') this.rowsAccepted += samples.length;
    this.lastWriteAt = new Date().toISOString();
    this.lastError = null;
    this.lastSnmpDisposition = result.status;
    return result.status;
  }

  async writeDurable(sample: TelemetrySample): Promise<void> {
    const body = { ...serializeTelemetryStoreSample(sample), entitySample: sample };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/samples`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const result = (await response.json()) as { accepted?: number };
      this.writes += 1;
      this.rowsAccepted += Number.isInteger(result.accepted) ? (result.accepted ?? 0) : 0;
      this.lastWriteAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.failures += 1;
      this.lastError = error instanceof Error ? error.message : 'unknown';
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async write(sample: TelemetrySample): Promise<void> {
    try {
      await this.writeDurable(sample);
    } catch (error) {
      logger.warn('telemetry.history.write_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  diagnostics(): TelemetryHistoryWriterDiagnostics {
    return {
      enabled: true,
      writes: this.writes,
      rowsAccepted: this.rowsAccepted,
      failures: this.failures,
      lastWriteAt: this.lastWriteAt,
      lastError: this.lastError,
    };
  }

  async queryLatestEntities(
    targetIds: readonly string[],
    targetType: string,
  ): Promise<readonly TelemetrySample[]> {
    if (!targetIds.length) return [];
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/entity-latest`);
    url.searchParams.set('targetType', targetType);
    for (const id of targetIds) url.searchParams.append('targetId', id);
    const response = await fetch(url, {
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`ENTITY_LATEST_HTTP_${response.status}`);
    const body = (await response.json()) as { samples?: TelemetrySample[] };
    return Array.isArray(body.samples) ? body.samples : [];
  }

  async queryEntity(
    targetId: string,
    targetType: string,
    window: TelemetryHistoryWindow,
  ): Promise<readonly TelemetrySample[]> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/entity-history`);
    url.searchParams.set('targetId', targetId);
    url.searchParams.set('targetType', targetType);
    url.searchParams.set('window', window);
    const response = await fetch(url, {
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`HISTORY_STORE_HTTP_${response.status}`);
    const body = (await response.json()) as { samples?: TelemetrySample[] };
    return Array.isArray(body.samples) ? body.samples : [];
  }

  async query(
    sourceIdentity: string,
    window: TelemetryHistoryWindow,
    rawPointIds: readonly string[],
  ): Promise<readonly TelemetryHistoryPoint[]> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/history`);
    url.searchParams.set('serial', sourceIdentity);
    url.searchParams.set('window', window);
    for (const rawPointId of rawPointIds) url.searchParams.append('rawPointId', rawPointId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...(this.accessToken ? { headers: { authorization: `Bearer ${this.accessToken}` } } : {}),
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HISTORY_STORE_HTTP_${response.status}`);
      }

      const body = (await response.json()) as { points?: readonly TelemetryHistoryPoint[] };
      return Array.isArray(body.points) ? body.points : [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createTelemetryStoreClient(): HttpTelemetryStore {
  const baseUrl = process.env.TELEMETRY_STORE_URL?.trim() || 'http://127.0.0.1:18081';
  const parsedTimeout = Number(process.env.TELEMETRY_STORE_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 5_000;
  const token = process.env.TELEMETRY_STORE_TOKEN?.trim();
  if (isProductionDeployment()) {
    if (!token || token.length < 32) {
      throw new Error('Production telemetry history store requires strong TELEMETRY_STORE_TOKEN.');
    }
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('Production telemetry history store requires HTTPS with no URL credentials.');
    }
  }
  return new HttpTelemetryStore(baseUrl, timeoutMs, token);
}
