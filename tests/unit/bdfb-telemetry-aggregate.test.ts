import { describe, expect, it } from 'vitest';

import { aggregateBdfbTelemetry } from '@/modules/telemetry/application/bdfb-telemetry-aggregate';
import type { BreakerHolder } from '@/modules/topology/domain/entities';
import type { BreakerTelemetryReading } from '@/modules/telemetry/domain/entities';

const endpoints: BreakerHolder[] = [
  { id: 'breaker-1', variant: 'BREAKER', label: 'CB-01', telemetry: { rawPointId: '0_1_1' } },
  { id: 'holder-2', variant: 'HOLDER', label: 'Holder 02' },
  { id: 'breaker-3', variant: 'BREAKER', label: 'CB-03', telemetry: { rawPointId: '0_1_3' } },
  { id: 'breaker-4', variant: 'BREAKER', label: 'CB-04', telemetry: { rawPointId: '0_1_4' } },
];

function reading(
  breakerId: string,
  voltageV: number,
  currentA: number,
  powerW: number,
  energyKwh: number,
  receivedAt: string,
): BreakerTelemetryReading {
  return {
    deviceId: 'bdfb-1',
    sourceIdentity: 'EMU-BFDB-03',
    shelfId: 'shelf-1',
    frameId: 'frame-a',
    panelId: 'panel-a1',
    panelLabel: 'A1',
    breakerId,
    breakerLabel: breakerId,
    rawPointId: breakerId === 'breaker-1' ? '0_1_1' : '0_1_3',
    position: breakerId === 'breaker-1' ? 1 : 3,
    metrics: {
      voltageV: { value: voltageV, observedAt: receivedAt },
      currentA: { value: currentA, observedAt: receivedAt },
      powerW: { value: powerW, observedAt: receivedAt },
      energyKwh: { value: energyKwh, observedAt: receivedAt },
    },
    state: { value: 'ONLINE', observedAt: receivedAt },
    receivedAt,
  };
}

describe('BDFB telemetry aggregate', () => {
  it('averages only breakers with live readings and never counts empty holders', () => {
    const aggregate = aggregateBdfbTelemetry(endpoints, [
      reading('breaker-1', 12, 2, 24, 1, '2026-09-30T22:48:00.000Z'),
      reading('breaker-3', 14, 4, 56, 3, '2026-09-30T22:48:02.000Z'),
    ]);

    expect(aggregate.totalBreakers).toBe(3);
    expect(aggregate.activeBreakers).toBe(2);
    expect(aggregate.emptyHolders).toBe(1);
    expect(aggregate.withoutLiveReading).toBe(1);
    expect(aggregate.averageVoltageV).toBe(13);
    expect(aggregate.averageCurrentA).toBe(3);
    expect(aggregate.averagePowerW).toBe(40);
    expect(aggregate.averageEnergyKwh).toBe(2);
    expect(aggregate.latestReceivedAt).toBe('2026-09-30T22:48:02.000Z');
  });

  it('returns no averages when breakers exist but no live readings are available', () => {
    const aggregate = aggregateBdfbTelemetry(endpoints, []);

    expect(aggregate.activeBreakers).toBe(0);
    expect(aggregate.emptyHolders).toBe(1);
    expect(aggregate.withoutLiveReading).toBe(3);
    expect(aggregate.averageVoltageV).toBeUndefined();
    expect(aggregate.averageCurrentA).toBeUndefined();
    expect(aggregate.averagePowerW).toBeUndefined();
    expect(aggregate.averageEnergyKwh).toBeUndefined();
  });
});
