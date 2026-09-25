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

function optionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isValidIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isoFromUnixSeconds(value: number): string | null {
  const milliseconds = value * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;

  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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
    sequence = optionalNonNegativeInteger(parsed.sequence);
    if (sequence === undefined) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let producerMessageId: string | undefined;
  if (parsed.messageId !== undefined) {
    producerMessageId = optionalNonEmptyString(parsed.messageId, 256);
    if (!producerMessageId) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let sourceMessageId: string | undefined;
  if (parsed.msgid !== undefined) {
    sourceMessageId = optionalNonEmptyString(parsed.msgid, 256);
    if (!sourceMessageId) {
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

  let sourceTimestampSeconds: number | undefined;
  if (parsed.timestamp !== undefined) {
    sourceTimestampSeconds = optionalNonNegativeInteger(parsed.timestamp);
    if (sourceTimestampSeconds === undefined || isoFromUnixSeconds(sourceTimestampSeconds) === null) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let sourceSendTimeSeconds: number | undefined;
  if (parsed.sendtime !== undefined) {
    sourceSendTimeSeconds = optionalNonNegativeInteger(parsed.sendtime);
    if (sourceSendTimeSeconds === undefined || isoFromUnixSeconds(sourceSendTimeSeconds) === null) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let sourceMethod: string | undefined;
  if (parsed.method !== undefined) {
    sourceMethod = optionalNonEmptyString(parsed.method, 64);
    if (!sourceMethod) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let sourceVersion: number | undefined;
  if (parsed.version !== undefined) {
    sourceVersion = optionalNonNegativeInteger(parsed.version);
    if (sourceVersion === undefined) {
      return failure('INVALID_PAYLOAD');
    }
  }

  let observedAt = receivedAt;
  let timestampProvenance: NormalizedTelemetryMessage['timestampProvenance'] =
    'RECEIVED_TIME_FALLBACK';

  if (parsed.observedAt !== undefined) {
    const candidate = optionalNonEmptyString(parsed.observedAt, 64);
    if (!candidate || !isValidIsoTimestamp(candidate)) {
      return failure('INVALID_PAYLOAD');
    }

    observedAt = candidate;
    timestampProvenance = 'DEVICE';
  } else if (sourceTimestampSeconds !== undefined) {
    const sourceObservedAt = isoFromUnixSeconds(sourceTimestampSeconds);
    if (!sourceObservedAt) {
      return failure('INVALID_PAYLOAD');
    }

    observedAt = sourceObservedAt;
    timestampProvenance = 'DEVICE';
  }

  const messageId =
    producerMessageId ??
    (sourceMessageId !== undefined && sourceTimestampSeconds !== undefined
      ? `legacy:${sourceMessageId}:ts:${sourceTimestampSeconds}`
      : undefined);

  return success({
    topic,
    topicSource,
    serialNumber,
    reported,
    observedAt,
    receivedAt,
    timestampProvenance,
    ...(sequence === undefined ? {} : { sequence }),
    ...(producerEpoch === undefined ? {} : { producerEpoch }),
    ...(messageId === undefined ? {} : { messageId }),
    ...(sourceMessageId === undefined ? {} : { sourceMessageId }),
    ...(sourceTimestampSeconds === undefined ? {} : { sourceTimestampSeconds }),
    ...(sourceSendTimeSeconds === undefined ? {} : { sourceSendTimeSeconds }),
    ...(sourceMethod === undefined ? {} : { sourceMethod }),
    ...(sourceVersion === undefined ? {} : { sourceVersion }),
  });
}
