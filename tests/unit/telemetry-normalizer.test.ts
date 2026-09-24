import { describe, expect, it } from 'vitest';

import { normalizeTelemetry } from '@/modules/telemetry/domain/normalizer';

const options = {
  topicPrefix: 'appmanager/v1/raw/',
  topicSuffix: '/telemetry',
  maxPayloadBytes: 1024,
};

describe('normalizeTelemetry', () => {
  it('preserves the V1 raw sn/reported contract and breaker addresses', () => {
    const result = normalizeTelemetry(
      'appmanager/v1/raw/source-001/telemetry',
      new TextEncoder().encode(
        JSON.stringify({
          sn: 'SN-001',
          observedAt: '2026-09-22T00:00:00.000Z',
          reported: { '0_1_1': { u: 52.1, se: 1 } },
        }),
      ),
      options,
      '2026-09-22T00:00:01.000Z',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        topic: 'appmanager/v1/raw/source-001/telemetry',
        topicSource: 'source-001',
        serialNumber: 'SN-001',
        reported: { '0_1_1': { u: 52.1, se: 1 } },
        observedAt: '2026-09-22T00:00:00.000Z',
        receivedAt: '2026-09-22T00:00:01.000Z',
        timestampProvenance: 'DEVICE',
      },
    });
  });

  it('uses receivedAt as an explicit fallback without pretending it came from hardware', () => {
    const result = normalizeTelemetry(
      'appmanager/v1/raw/source-001/telemetry',
      new TextEncoder().encode(JSON.stringify({ sn: 'SN-001', reported: {} })),
      options,
      '2026-09-22T00:00:01.000Z',
    );

    expect(result.ok && result.value.timestampProvenance).toBe('RECEIVED_TIME_FALLBACK');
    expect(result.ok && result.value.observedAt).toBe('2026-09-22T00:00:01.000Z');
  });

  it('rejects topics outside the exact source-scoped namespace', () => {
    expect(
      normalizeTelemetry(
        'other/source-001/telemetry',
        new TextEncoder().encode('{}'),
        options,
      ),
    ).toEqual({ ok: false, error: 'TOPIC_NOT_ALLOWED' });

    expect(
      normalizeTelemetry(
        'appmanager/v1/raw/source-001/other',
        new TextEncoder().encode('{}'),
        options,
      ),
    ).toEqual({ ok: false, error: 'TOPIC_NOT_ALLOWED' });
  });

  it('rejects missing serial/reported, malformed JSON, oversized payloads and invalid slots', () => {
    expect(
      normalizeTelemetry(
        'appmanager/v1/raw/source-001/telemetry',
        new TextEncoder().encode('{'),
        options,
      ),
    ).toEqual({ ok: false, error: 'INVALID_JSON' });

    expect(
      normalizeTelemetry(
        'appmanager/v1/raw/source-001/telemetry',
        new Uint8Array(1025),
        options,
      ),
    ).toEqual({ ok: false, error: 'PAYLOAD_TOO_LARGE' });

    expect(
      normalizeTelemetry(
        'appmanager/v1/raw/source-001/telemetry',
        new TextEncoder().encode(JSON.stringify({ reported: {} })),
        options,
      ),
    ).toEqual({ ok: false, error: 'SERIAL_NUMBER_MISSING' });

    expect(
      normalizeTelemetry(
        'appmanager/v1/raw/source-001/telemetry',
        new TextEncoder().encode(JSON.stringify({ sn: 'SN-001' })),
        options,
      ),
    ).toEqual({ ok: false, error: 'REPORTED_MISSING' });

    expect(
      normalizeTelemetry(
        'appmanager/v1/raw/source-001/telemetry',
        new TextEncoder().encode(
          JSON.stringify({ sn: 'SN-001', reported: { '0_1_25': { u: 48 } } }),
        ),
        options,
      ),
    ).toEqual({ ok: false, error: 'INVALID_BREAKER_ADDRESS' });
  });
});
