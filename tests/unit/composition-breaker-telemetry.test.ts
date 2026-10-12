import { describe, expect, it } from 'vitest';

import {
  compositionBreakerTelemetry,
  type CompositionBreakerBinding,
} from '@/modules/telemetry/domain/composition-breaker-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const timestamp = '2026-10-12T23:00:00.000Z';
const now = Date.parse(timestamp);
const sourceLink: CompositionBreakerBinding = {
  id: 'source',
  targetId: 'breaker-01',
  sourceIdentity: 'BRK-SN-01',
  metric: 'SOURCE',
};
const voltageLink: CompositionBreakerBinding = {
  id: 'voltage',
  targetId: 'breaker-01',
  sourceIdentity: 'EMU-BFDB-03',
  sourcePointId: '0_1_1',
  metric: 'VOLTAGE',
};

function sample(
  targetId: string,
  serial: string,
  reported: Record<string, unknown>,
): TelemetrySample {
  return {
    bindingId: 'source',
    targetId,
    targetType: 'EQUIPMENT',
    entityId: targetId,
    entityKind: 'EQUIPMENT',
    sourceIdentity: serial,
    receivedAt: timestamp,
    reported,
  };
}

describe('Equipment Composition breaker telemetry', () => {
  it('shows own SN-associated readings only on the exact breaker', () => {
    const reading = sample('breaker-01', 'BRK-SN-01', {
      voltageV: { value: 13.79, unit: 'V' },
      currentA: { value: 8.55, unit: 'A' },
      powerW: { value: 117.9, unit: 'W' },
      energyKwh: { value: 0.4224, unit: 'kWh' },
    });
    expect(
      compositionBreakerTelemetry('breaker-01', 'device', [reading], [sourceLink], now),
    ).toMatchObject({
      status: 'LIVE',
      voltageV: 13.79,
      currentA: 8.55,
      powerW: 117.9,
      energyKwh: 0.4224,
      sourceIdentity: 'BRK-SN-01',
    });
    expect(
      compositionBreakerTelemetry('breaker-02', 'device', [reading], [sourceLink], now),
    ).toEqual({
      status: 'UNMAPPED',
    });
  });

  it('does not attach the parent panel raw 0_1_N readings to its children by position', () => {
    const packet = sample('panel', 'EMU-BFDB-03', {
      '0_1_1': { state: 'ONLINE', U1: 13.79, I1: 8.55 },
    });
    expect(compositionBreakerTelemetry('breaker-01', 'device', [packet], [], now)).toEqual({
      status: 'UNMAPPED',
    });
    expect(
      compositionBreakerTelemetry('breaker-01', 'device', [packet], [voltageLink], now),
    ).toEqual({
      status: 'NO DATA',
    });
  });

  it('renders a gateway circuit only with exact source and raw-point bindings', () => {
    const packet: TelemetrySample = {
      ...sample('chassis', 'EMU-BFDB-03', {}),
      breakerReadings: [
        {
          deviceId: 'device',
          sourceIdentity: 'EMU-BFDB-03',
          shelfId: 'shelf',
          frameId: 'frame',
          panelId: 'panel',
          panelLabel: 'A1',
          breakerId: 'breaker-01',
          breakerLabel: 'Circuit Breaker',
          rawPointId: '0_1_1',
          position: 1,
          metrics: {
            voltageV: { value: 13.79, observedAt: timestamp },
            currentA: { value: 8.55, observedAt: timestamp },
          },
          receivedAt: timestamp,
        },
      ],
    };
    const reading = compositionBreakerTelemetry(
      'breaker-01',
      'device',
      [packet],
      [voltageLink],
      now,
    );
    expect(reading.status).toBe('LIVE');
    expect(reading.voltageV).toBe(13.79);
    expect(reading.currentA).toBeUndefined();
    expect(reading.sourcePointId).toBe('0_1_1');
    expect(
      compositionBreakerTelemetry('breaker-01', 'unrelated-device', [packet], [voltageLink], now)
        .status,
    ).toBe('NO DATA');
  });

  it('distinguishes STALE and OFFLINE and excludes wrong-unit measurements', () => {
    const reading = sample('breaker-01', 'BRK-SN-01', {
      voltageV: { value: 20, unit: 'C' },
      currentA: 1.2,
    });
    expect(
      compositionBreakerTelemetry('breaker-01', 'device', [reading], [sourceLink], now),
    ).toMatchObject({
      status: 'LIVE',
      currentA: 1.2,
    });
    expect(
      compositionBreakerTelemetry('breaker-01', 'device', [reading], [sourceLink], now).voltageV,
    ).toBeUndefined();
    expect(
      compositionBreakerTelemetry('breaker-01', 'device', [reading], [sourceLink], now + 90_000)
        .status,
    ).toBe('STALE');
    expect(
      compositionBreakerTelemetry('breaker-01', 'device', [reading], [sourceLink], now + 301_000)
        .status,
    ).toBe('OFFLINE');
  });

  it('fails closed when competing authenticated sources claim the same breaker', () => {
    const competing = {
      ...sample('breaker-01', 'BRK-SN-02', { voltageV: 11 }),
      bindingId: 'other-source',
    };
    expect(
      compositionBreakerTelemetry(
        'breaker-01',
        'device',
        [sample('breaker-01', 'BRK-SN-01', { voltageV: 13 }), competing],
        [sourceLink, { ...sourceLink, id: 'other-source', sourceIdentity: 'BRK-SN-02' }],
        now,
      ).status,
    ).toBe('CONFLICT');
  });
});
