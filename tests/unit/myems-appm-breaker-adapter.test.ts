import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import {
  adaptMyemsAppmBreakerEvent,
  MYEMS_APPM_BREAKER_PROFILE,
} from '@/modules/telemetry/domain/myems-appm-breaker-adapter';

const fixture = JSON.parse(
  readFileSync(
    new URL('../fixtures/telemetry/myems-appm-breaker-v1.json', import.meta.url),
    'utf8',
  ),
) as { reported: Record<string, unknown> };

function record(
  reported: Record<string, unknown> = fixture.reported,
  protocolProfile = MYEMS_APPM_BREAKER_PROFILE,
): TelemetryAcceptanceRecord {
  return {
    eventId: 'event-1',
    payloadSha256: 'a'.repeat(64),
    acceptedAt: '2026-09-24T00:00:01.000Z',
    historyState: 'PENDING',
    historyAttempts: 0,
    sample: {
      entityId: 'device-1',
      entityKind: 'DEVICE',
      sourceId: 'source-1',
      sourceIdentity: 'SN-HISTORICAL-FIXTURE',
      serialNumber: 'SN-HISTORICAL-FIXTURE',
      protocolProfile,
      rawSchemaVersion: 'telxius-v1',
      reported,
      observedAt: '2026-09-24T00:00:00.000Z',
      receivedAt: '2026-09-24T00:00:01.000Z',
      timestampProvenance: 'DEVICE',
    },
  };
}

describe('adaptMyemsAppmBreakerEvent', () => {
  it('maps only historically evidenced breaker metrics into the canonical catalog', () => {
    const result = adaptMyemsAppmBreakerEvent(record());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metricCatalogVersion).toBe('myems-appm-breaker-v1');
    expect(result.value.metrics).toHaveLength(6);
    expect(result.value.metrics).toEqual(
      expect.arrayContaining([
        {
          componentAddress: '0_1_1',
          key: 'voltage_v',
          channel: 1,
          value: 48.1,
          unit: 'V',
          quality: 'VALID',
          derivation: 'RAW',
          rawKey: 'U1',
          sourceState: 'ON',
        },
        {
          componentAddress: '0_1_1',
          key: 'current_a',
          channel: 2,
          value: 4.5,
          unit: 'A',
          quality: 'VALID',
          derivation: 'RAW',
          rawKey: 'I2',
          sourceState: 'ON',
        },
        {
          componentAddress: '0_1_1',
          key: 'active_power_w',
          channel: 1,
          value: 240.5,
          unit: 'W',
          quality: 'VALID',
          derivation: 'RAW',
          rawKey: 'P1',
          sourceState: 'ON',
        },
      ]),
    );
  });

  it('accepts observed legacy state and marks registry-declared synthetic metrics as simulated', () => {
    const base = record({
      '0_1_1': {
        state: 'ONLINE',
        U1: '12.23',
        EP1: '1.50',
      },
    });
    const result = adaptMyemsAppmBreakerEvent({
      ...base,
      sample: {
        ...base.sample,
        simulated: true,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.simulated).toBe(true);
    expect(result.value.metrics).toEqual([
      expect.objectContaining({
        componentAddress: '0_1_1',
        key: 'voltage_v',
        value: 12.23,
        quality: 'SIMULATED',
        sourceState: 'ONLINE',
      }),
    ]);
  });

  it('does not infer breaker semantics for the ZIP-backed minimal telxius profile', () => {
    expect(adaptMyemsAppmBreakerEvent(record({}, 'telxius-v1'))).toEqual({
      ok: false,
      error: 'UNSUPPORTED_PROTOCOL_PROFILE',
    });
  });

  it('rejects malformed historically-known metric values instead of silently coercing them', () => {
    expect(
      adaptMyemsAppmBreakerEvent(
        record({
          '0_1_1': {
            U1: 'not-a-number',
          },
        }),
      ),
    ).toEqual({ ok: false, error: 'INVALID_METRIC_VALUE' });
  });

  it('keeps unknown raw fields out of the canonical metric catalog', () => {
    const result = adaptMyemsAppmBreakerEvent(
      record({
        '0_1_1': {
          U1: 48,
          temperature: 30,
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metrics).toEqual([
      expect.objectContaining({
        key: 'voltage_v',
        value: 48,
        rawKey: 'U1',
      }),
    ]);
  });
});
