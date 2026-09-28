import { describe, expect, it } from 'vitest';

import { normalizeTelemetry } from '@/modules/telemetry/domain/normalizer';

const options = { topicPrefix: 'data/dev/', maxPayloadBytes: 1024 };

describe('normalizeTelemetry', () => {
  it('normalizes generic reported payloads', () => {
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
        protocol: 'GENERIC',
      },
    });
  });

  it('normalizes the BFDB gateway envelope without losing source clocks', () => {
    const timestamp = 1_790_580_000;
    const result = normalizeTelemetry(
      'data/dev/EMU-BFDB-01',
      new TextEncoder().encode(
        JSON.stringify({
          msgid: '2289',
          method: 'update',
          sn: 'EMU-BFDB-01',
          timestamp,
          sendtime: timestamp + 1,
          version: 1,
          reported: {
            '0_1_1': { state: 'ONLINE', U1: '13.82', I1: '3.46', P1: '47.83', EP1: '0.5074' },
          },
        }),
      ),
      options,
      '2026-09-28T12:00:00.000Z',
    );

    expect(result).toEqual({
      ok: true,
      value: {
        topic: 'data/dev/EMU-BFDB-01',
        sourceIdentity: 'EMU-BFDB-01',
        reported: {
          '0_1_1': { state: 'ONLINE', U1: '13.82', I1: '3.46', P1: '47.83', EP1: '0.5074' },
        },
        receivedAt: '2026-09-28T12:00:00.000Z',
        protocol: 'BFDB',
        messageId: '2289',
        sourceObservedAt: new Date(timestamp * 1000).toISOString(),
        sourceSentAt: new Date((timestamp + 1) * 1000).toISOString(),
      },
    });
  });

  it('rejects a BFDB topic/payload serial mismatch', () => {
    const result = normalizeTelemetry(
      'data/dev/EMU-BFDB-01',
      new TextEncoder().encode(
        JSON.stringify({
          msgid: '1',
          method: 'update',
          sn: 'EMU-BFDB-02',
          timestamp: 1_790_580_000,
          reported: {},
        }),
      ),
      options,
    );

    expect(result).toEqual({ ok: false, error: 'SOURCE_IDENTITY_MISMATCH' });
  });

  it('rejects topics outside the allowlisted prefix', () => {
    const result = normalizeTelemetry('other/SN-001', new TextEncoder().encode('{}'), options);

    expect(result).toEqual({
      ok: false,
      error: 'TOPIC_NOT_ALLOWED',
    });
  });

  it('rejects malformed JSON and oversized payloads', () => {
    expect(normalizeTelemetry('data/dev/SN-001', new TextEncoder().encode('{'), options)).toEqual({
      ok: false,
      error: 'INVALID_JSON',
    });

    expect(normalizeTelemetry('data/dev/SN-001', new Uint8Array(1025), options)).toEqual({
      ok: false,
      error: 'PAYLOAD_TOO_LARGE',
    });
  });
});
