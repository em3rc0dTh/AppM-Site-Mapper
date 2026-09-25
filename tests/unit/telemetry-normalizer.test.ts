import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { normalizeTelemetry } from '@/modules/telemetry/domain/normalizer';

const options = {
  topicPrefix: 'appmanager/v1/raw/',
  topicSuffix: '/telemetry',
  maxPayloadBytes: 1024,
};

const telxiusV1Minimum = readFileSync(
  new URL('../fixtures/telemetry/telxius-v1-minimal.json', import.meta.url),
  'utf8',
);

describe('normalizeTelemetry', () => {
  it('accepts the source-backed V1 minimum without inventing metric semantics', () => {
    const result = normalizeTelemetry(
      'appmanager/v1/raw/source-001/telemetry',
      new TextEncoder().encode(telxiusV1Minimum),
      options,
      '2026-09-22T00:00:01.000Z',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        topic: 'appmanager/v1/raw/source-001/telemetry',
        topicSource: 'source-001',
        serialNumber: 'SERIAL-DEL-DISPOSITIVO',
        reported: { metric_key: 13.09 },
        observedAt: '2026-09-22T00:00:01.000Z',
        receivedAt: '2026-09-22T00:00:01.000Z',
        timestampProvenance: 'RECEIVED_TIME_FALLBACK',
      },
    });
  });

  it('preserves an explicitly valid device timestamp when a newer producer supplies one', () => {
    const result = normalizeTelemetry(
      'appmanager/v1/raw/source-001/telemetry',
      new TextEncoder().encode(
        JSON.stringify({
          sn: 'SN-001',
          observedAt: '2026-09-22T00:00:00.000Z',
          reported: { metric_key: 13.09 },
        }),
      ),
      options,
      '2026-09-22T00:00:01.000Z',
    );

    expect(result.ok && result.value.observedAt).toBe('2026-09-22T00:00:00.000Z');
    expect(result.ok && result.value.timestampProvenance).toBe('DEVICE');
  });

  it('preserves optional producer message identity without making it mandatory for V1', () => {
    const result = normalizeTelemetry(
      'appmanager/v1/raw/source-001/telemetry',
      new TextEncoder().encode(
        JSON.stringify({
          sn: 'SN-001',
          messageId: 'message-7',
          producerEpoch: 'boot-2',
          sequence: 7,
          reported: {},
        }),
      ),
      options,
      '2026-09-22T00:00:01.000Z',
    );

    expect(result.ok && result.value.messageId).toBe('message-7');
    expect(result.ok && result.value.producerEpoch).toBe('boot-2');
    expect(result.ok && result.value.sequence).toBe(7);
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
      normalizeTelemetry('other/source-001/telemetry', new TextEncoder().encode('{}'), options),
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
      normalizeTelemetry('appmanager/v1/raw/source-001/telemetry', new Uint8Array(1025), options),
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
          JSON.stringify({ sn: 'SN-001', reported: { '0_1_25': { metric_key: 13.09 } } }),
        ),
        options,
      ),
    ).toEqual({ ok: false, error: 'INVALID_BREAKER_ADDRESS' });
  });
});
