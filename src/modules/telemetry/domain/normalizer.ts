import { parseBreakerAddress } from '@/modules/telemetry/domain/breaker-address';
import type { NormalizedTelemetryMessage } from '@/modules/telemetry/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryNormalizationError =
  | 'TOPIC_NOT_ALLOWED'
  | 'SOURCE_IDENTITY_MISSING'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_PAYLOAD'
  | 'SERIAL_NUMBER_MISSING'
  | 'REPORTED_MISSING'
  | 'TOO_MANY_REPORTED_ENTRIES'
  | 'INVALID_BREAKER_ADDRESS';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalNonEmptyString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function isValidIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

export interface TelemetryNormalizerOptions {
  readonly topicPrefix: string;
  readonly topicSuffix: string;
  readonly maxPayloadBytes: number;
  readonly maxReportedEntries?: number;
}

export function normalizeTelemetry(
  topic: string,
  payload: Uint8Array,
  options: TelemetryNormalizerOptions,
  receivedAt = new Date().toISOString(),
): Result<NormalizedTelemetryMessage, TelemetryNormalizationError> {
  if (!topic.startsWith(options.topicPrefix) || !topic.endsWith(options.topicSuffix)) {
    return failure('TOPIC_NOT_ALLOWED');
  }

  const topicSource = topic
    .slice(options.topicPrefix.length, topic.length - options.topicSuffix.length)
    .trim();

  if (!topicSource || topicSource.includes('/')) {
    return failure('SOURCE_IDENTITY_MISSING');
  }

  if (payload.byteLength > options.maxPayloadBytes) {
    return failure('PAYLOAD_TOO_LARGE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return failure('INVALID_JSON');
  }

  if (!isRecord(parsed)) {
    return failure('INVALID_PAYLOAD');
  }

  const serialNumber = optionalNonEmptyString(parsed.sn, 128);
  if (!serialNumber) {
    return failure('SERIAL_NUMBER_MISSING');
  }

  if (!isRecord(parsed.reported)) {
    return failure('REPORTED_MISSING');
  }

  const reported = parsed.reported;
  const entries = Object.entries(reported);
  if (entries.length > (options.maxReportedEntries ?? 512)) {
    return failure('TOO_MANY_REPORTED_ENTRIES');
  }

  for (const [key] of entries) {
    if (/^\d+_\d+_\d+$/.test(key) && !parseBreakerAddress(key).ok) {
      return failure('INVALID_BREAKER_ADDRESS');
    }
  }

  let sequence: number | undefined;
  if (parsed.sequence !== undefined) {
    if (
      typeof parsed.sequence !== 'number' ||
      !Number.isSafeInteger(parsed.sequence) ||
      parsed.sequence < 0
    ) {
      return failure('INVALID_PAYLOAD');
    }
    sequence = parsed.sequence;
  }

  let messageId: string | undefined;
  if (parsed.messageId !== undefined) {
    messageId = optionalNonEmptyString(parsed.messageId, 256);
    if (!messageId) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let producerEpoch: string | undefined;
  if (parsed.producerEpoch !== undefined) {
    producerEpoch = optionalNonEmptyString(parsed.producerEpoch, 256);
    if (!producerEpoch) {
      return failure('INVALID_PAYLOAD');
    }
  }

  const candidateObservedAt = optionalNonEmptyString(parsed.observedAt, 64);
  const hasTrustedDeviceTime =
    candidateObservedAt !== undefined && isValidIsoTimestamp(candidateObservedAt);
  const observedAt = hasTrustedDeviceTime ? candidateObservedAt : receivedAt;

  return success({
    topic,
    topicSource,
    serialNumber,
    reported,
    observedAt,
    receivedAt,
    timestampProvenance: hasTrustedDeviceTime ? 'DEVICE' : 'RECEIVED_TIME_FALLBACK',
    ...(sequence === undefined ? {} : { sequence }),
    ...(producerEpoch === undefined ? {} : { producerEpoch }),
    ...(messageId === undefined ? {} : { messageId }),
  });
}
