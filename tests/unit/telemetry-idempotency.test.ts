import { describe, expect, it } from 'vitest';

import {
  buildTelemetryIdempotencyKey,
  sha256Payload,
} from '@/modules/telemetry/application/telemetry-idempotency';
import type { NormalizedTelemetryMessage } from '@/modules/telemetry/domain/entities';

function message(
  overrides: Partial<NormalizedTelemetryMessage> = {},
): NormalizedTelemetryMessage {
  return {
    topic: 'appmanager/v1/raw/source-1/telemetry',
    topicSource: 'source-1',
    serialNumber: 'SN-1',
    reported: {},
    observedAt: '2026-09-24T00:00:00.000Z',
    receivedAt: '2026-09-24T00:00:01.000Z',
    timestampProvenance: 'DEVICE',
    ...overrides,
  };
}

describe('telemetry idempotency', () => {
  it('prefers messageId when the producer supplies one', () => {
    const left = buildTelemetryIdempotencyKey('source-1', message({ messageId: 'msg-1' }));
    const right = buildTelemetryIdempotencyKey('source-1', message({ messageId: 'msg-1' }));

    expect(left).toBe(right);
    expect(left).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('uses producerEpoch and sequence together, not sequence alone', () => {
    expect(
      buildTelemetryIdempotencyKey(
        'source-1',
        message({ producerEpoch: 'boot-1', sequence: 42 }),
      ),
    ).toMatch(/^sha256:[a-f0-9]{64}$/);

    expect(buildTelemetryIdempotencyKey('source-1', message({ sequence: 42 }))).toBeUndefined();
  });

  it('does not fabricate idempotency for the minimal V1 payload', () => {
    expect(buildTelemetryIdempotencyKey('source-1', message())).toBeUndefined();
  });

  it('creates a stable SHA-256 payload fingerprint', () => {
    const payload = new TextEncoder().encode('{"sn":"SN-1","reported":{}}');
    expect(sha256Payload(payload)).toBe(sha256Payload(payload));
    expect(sha256Payload(payload)).toMatch(/^[a-f0-9]{64}$/);
  });
});
