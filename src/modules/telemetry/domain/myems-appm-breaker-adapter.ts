import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import { parseBreakerAddress } from '@/modules/telemetry/domain/breaker-address';
import type {
  CanonicalTelemetryEvent,
  CanonicalTelemetryMetric,
} from '@/modules/telemetry/domain/canonical';
import { isRecord } from '@/modules/telemetry/domain/validation';
import { failure, success, type Result } from '@/shared/domain/result';

export const MYEMS_APPM_BREAKER_PROFILE = 'myems-appm-breaker-v1';

export type MyemsAppmBreakerAdapterError =
  | 'UNSUPPORTED_PROTOCOL_PROFILE'
  | 'INVALID_BREAKER_READING'
  | 'INVALID_METRIC_VALUE';

const metricMap = {
  U1: { key: 'voltage_v', channel: 1, unit: 'V' },
  U2: { key: 'voltage_v', channel: 2, unit: 'V' },
  I1: { key: 'current_a', channel: 1, unit: 'A' },
  I2: { key: 'current_a', channel: 2, unit: 'A' },
  P1: { key: 'active_power_w', channel: 1, unit: 'W' },
  P2: { key: 'active_power_w', channel: 2, unit: 'W' },
} as const;

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sourceState(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32) return undefined;
  return trimmed;
}

export function adaptMyemsAppmBreakerEvent(
  record: TelemetryAcceptanceRecord,
): Result<CanonicalTelemetryEvent, MyemsAppmBreakerAdapterError> {
  const sample = record.sample;

  if (sample.protocolProfile !== MYEMS_APPM_BREAKER_PROFILE) {
    return failure('UNSUPPORTED_PROTOCOL_PROFILE');
  }

  const metrics: CanonicalTelemetryMetric[] = [];

  for (const [componentAddress, rawReading] of Object.entries(sample.reported)) {
    const address = parseBreakerAddress(componentAddress);
    if (!address.ok || !isRecord(rawReading)) {
      return failure('INVALID_BREAKER_READING');
    }

    const state = sourceState(rawReading.s);

    for (const rawKey of Object.keys(metricMap) as Array<keyof typeof metricMap>) {
      if (rawReading[rawKey] === undefined) continue;

      const value = numericValue(rawReading[rawKey]);
      if (value === null) {
        return failure('INVALID_METRIC_VALUE');
      }

      const definition = metricMap[rawKey];
      metrics.push({
        componentAddress,
        key: definition.key,
        channel: definition.channel,
        value,
        unit: definition.unit,
        quality: 'VALID',
        derivation: 'RAW',
        rawKey,
        ...(state === undefined ? {} : { sourceState: state }),
      });
    }
  }

  return success({
    schemaVersion: 1,
    metricCatalogVersion: 'myems-appm-breaker-v1',
    eventId: record.eventId,
    sourceId: sample.sourceId,
    entityId: sample.entityId,
    entityKind: sample.entityKind,
    serialNumber: sample.serialNumber,
    protocolProfile: sample.protocolProfile,
    rawSchemaVersion: sample.rawSchemaVersion,
    observedAt: sample.observedAt,
    receivedAt: sample.receivedAt,
    timestampProvenance: sample.timestampProvenance,
    ...(sample.sequence === undefined ? {} : { sequence: sample.sequence }),
    ...(sample.producerEpoch === undefined ? {} : { producerEpoch: sample.producerEpoch }),
    ...(sample.messageId === undefined ? {} : { messageId: sample.messageId }),
    metrics,
  });
}
