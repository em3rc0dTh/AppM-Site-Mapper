import { createHash } from 'node:crypto';

import type { NormalizedTelemetryMessage } from '@/modules/telemetry/domain/entities';

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Payload(payload: Uint8Array): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function buildTelemetryIdempotencyKey(
  sourceId: string,
  message: NormalizedTelemetryMessage,
): string | undefined {
  if (message.messageId) {
    return `sha256:${sha256Text(`${sourceId}:message:${message.messageId}`)}`;
  }

  if (message.producerEpoch && message.sequence !== undefined) {
    return `sha256:${sha256Text(
      `${sourceId}:epoch:${message.producerEpoch}:sequence:${message.sequence}`,
    )}`;
  }

  return undefined;
}
