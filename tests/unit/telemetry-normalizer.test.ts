import { describe, expect, it } from 'vitest';

import { normalizeTelemetry } from '@/modules/telemetry/domain/normalizer';

const options = { topicPrefix: 'data/dev/', maxPayloadBytes: 1024 };

describe('normalizeTelemetry', () => {
  it('normalizes legacy reported payloads', () => {
    const result = normalizeTelemetry(
      'data/dev/SN-001',
      new TextEncoder().encode(JSON.stringify({ reported: { voltage: 52.1 } })),
      options,
      '2026-09-22T00:00:00.000Z',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        topic: 'data/dev/SN-001',
        sourceIdentity: 'SN-001',
        reported: { voltage: 52.1 },
        receivedAt: '2026-09-22T00:00:00.000Z',
      },
    });
  });

  it('rejects topics outside the allowlisted prefix', () => {
    const result = normalizeTelemetry(
      'other/SN-001',
      new TextEncoder().encode('{}'),
      options,
    );

    expect(result).toEqual({ ok: false, error: 'TOPIC_NOT_ALLOWED' });
  });

  it('rejects malformed JSON and oversized payloads', () => {
    expect(normalizeTelemetry('data/dev/SN-001', new TextEncoder().encode('{'), options)).toEqual({
      ok: false,
      error: 'INVALID_JSON',
    });

    expect(
      normalizeTelemetry('data/dev/SN-001', new Uint8Array(1025), options),
    ).toEqual({ ok: false, error: 'PAYLOAD_TOO_LARGE' });
  });
});
