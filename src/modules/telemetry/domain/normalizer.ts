import type { NormalizedTelemetryMessage } from '@/modules/telemetry/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryNormalizationError =
  | 'TOPIC_NOT_ALLOWED'
  | 'SOURCE_IDENTITY_MISSING'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'INVALID_PAYLOAD';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

  const reported = isRecord(parsed.reported) ? parsed.reported : parsed;

  return success({
    topic,
    sourceIdentity,
    reported,
    receivedAt,
  });
}
