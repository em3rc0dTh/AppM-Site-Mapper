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
    deviceId: sample.entityId,
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

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async write(sample: TelemetrySample): Promise<void> {
    const body = serializeTelemetryStoreSample(sample);
    if (!body) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/samples`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      logger.warn('telemetry.history.write_failed', { reason: this.lastError });
    } finally {
      clearTimeout(timeout);
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
  return new HttpTelemetryStore(baseUrl, timeoutMs);
}
