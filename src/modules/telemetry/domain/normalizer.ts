import type { NormalizedTelemetryMessage } from '@/modules/telemetry/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryNormalizationError =
  | 'TOPIC_NOT_ALLOWED'
  | 'SOURCE_IDENTITY_MISSING'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_PAYLOAD'
  | 'UNSUPPORTED_METHOD'
  | 'INVALID_TIMESTAMP';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function epochToIso(value: unknown): string | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return new Date(numeric * 1000).toISOString();
}

export interface TelemetryNormalizerOptions {
  readonly topicPrefix: string;
  readonly maxPayloadBytes: number;
}

export function normalizeTelemetry(
  topic: string,
  payload: Uint8Array,
  options: TelemetryNormalizerOptions,
  receivedAt = new Date().toISOString(),
): Result<NormalizedTelemetryMessage, TelemetryNormalizationError> {
  if (!topic.startsWith(options.topicPrefix)) {
    return failure('TOPIC_NOT_ALLOWED');
  }

  const sourceIdentity = topic.slice(options.topicPrefix.length).split('/')[0]?.trim();

  if (!sourceIdentity) {
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

  const looksLikeBfdb =
    'method' in parsed ||
    'sn' in parsed ||
    'timestamp' in parsed ||
    'sendtime' in parsed ||
    'msgid' in parsed;

  if (looksLikeBfdb) {
    if (parsed.method !== 'update') {
      return failure('UNSUPPORTED_METHOD');
    }

    if (typeof parsed.sn !== 'string' || parsed.sn.trim() !== sourceIdentity) {
      return failure('SOURCE_IDENTITY_MISMATCH');
    }

    if (!isRecord(parsed.reported)) {
      return failure('INVALID_PAYLOAD');
    }

    const sourceObservedAt = epochToIso(parsed.timestamp);
    if (!sourceObservedAt) {
      return failure('INVALID_TIMESTAMP');
    }

    const sourceSentAt =
      parsed.sendtime === undefined ? sourceObservedAt : epochToIso(parsed.sendtime);
    if (!sourceSentAt) {
      return failure('INVALID_TIMESTAMP');
    }

    const messageId =
      parsed.msgid === undefined || parsed.msgid === null ? undefined : String(parsed.msgid);

    return success({
      topic,
      sourceIdentity,
      reported: parsed.reported,
      receivedAt,
      protocol: 'BFDB',
      ...(messageId ? { messageId } : {}),
      sourceObservedAt,
      sourceSentAt,
    });
  }

  const reported = isRecord(parsed.reported) ? parsed.reported : parsed;

  return success({
    topic,
    sourceIdentity,
    reported,
    receivedAt,
    protocol: 'GENERIC',
  });
}
