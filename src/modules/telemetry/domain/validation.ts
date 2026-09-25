import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import type { TelemetrySample, TelemetrySource } from '@/modules/telemetry/domain/entities';
import type { TelemetryQuarantineRecord } from '@/modules/telemetry/domain/quarantine';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function isTelemetrySource(value: unknown): value is TelemetrySource {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.entityId === 'string' &&
    (value.entityKind === 'DEVICE' || value.entityKind === 'EQUIPMENT') &&
    typeof value.topicSource === 'string' &&
    typeof value.expectedSerialNumber === 'string' &&
    typeof value.protocolProfile === 'string' &&
    typeof value.rawSchemaVersion === 'string' &&
    typeof value.staleAfterSeconds === 'number' &&
    Number.isFinite(value.staleAfterSeconds) &&
    value.staleAfterSeconds > 0 &&
    typeof value.enabled === 'boolean'
  );
}

export function isTelemetrySample(value: unknown): value is TelemetrySample {
  if (!isRecord(value) || !isRecord(value.reported)) return false;

  return (
    typeof value.entityId === 'string' &&
    (value.entityKind === 'DEVICE' || value.entityKind === 'EQUIPMENT') &&
    typeof value.sourceId === 'string' &&
    typeof value.sourceIdentity === 'string' &&
    typeof value.serialNumber === 'string' &&
    typeof value.protocolProfile === 'string' &&
    typeof value.rawSchemaVersion === 'string' &&
    typeof value.observedAt === 'string' &&
    typeof value.receivedAt === 'string' &&
    (value.timestampProvenance === 'DEVICE' ||
      value.timestampProvenance === 'RECEIVED_TIME_FALLBACK') &&
    (value.sequence === undefined ||
      (typeof value.sequence === 'number' &&
        Number.isSafeInteger(value.sequence) &&
        value.sequence >= 0)) &&
    (value.messageId === undefined || typeof value.messageId === 'string') &&
    (value.producerEpoch === undefined || typeof value.producerEpoch === 'string')
  );
}

export function isTelemetryAcceptanceRecord(value: unknown): value is TelemetryAcceptanceRecord {
  if (!isRecord(value)) return false;

  return (
    typeof value.eventId === 'string' &&
    (value.idempotencyKey === undefined || typeof value.idempotencyKey === 'string') &&
    typeof value.payloadSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.payloadSha256) &&
    isTelemetrySample(value.sample) &&
    typeof value.acceptedAt === 'string' &&
    (value.historyState === 'PENDING' ||
      value.historyState === 'IN_FLIGHT' ||
      value.historyState === 'DELIVERED') &&
    typeof value.historyAttempts === 'number' &&
    Number.isSafeInteger(value.historyAttempts) &&
    value.historyAttempts >= 0 &&
    isOptionalString(value.nextHistoryAttemptAt) &&
    isOptionalString(value.historyLeaseUntil) &&
    isOptionalString(value.historyLeaseOwner) &&
    isOptionalString(value.historyLastErrorCode) &&
    isOptionalString(value.deliveredAt)
  );
}

export function isTelemetryQuarantineRecord(value: unknown): value is TelemetryQuarantineRecord {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.receivedAt === 'string' &&
    typeof value.expiresAt === 'string' &&
    typeof value.topic === 'string' &&
    typeof value.failureCode === 'string' &&
    typeof value.payloadBytes === 'number' &&
    Number.isSafeInteger(value.payloadBytes) &&
    value.payloadBytes >= 0 &&
    typeof value.payloadSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.payloadSha256) &&
    (value.sourceId === undefined || typeof value.sourceId === 'string') &&
    (value.claimedSerialNumber === undefined || typeof value.claimedSerialNumber === 'string')
  );
}
