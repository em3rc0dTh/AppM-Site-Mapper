import { describe, expect, it } from 'vitest';

import { aggregateBdfbDescendantTelemetry } from '@/modules/telemetry/application/bdfb-descendant-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const at = '2026-10-20T20:48:42.299Z';
const now = Date.parse(at) + 1000;

function sample(
  id: string,
  point: string,
  volts: number,
  amps: number,
  power: number,
  energy: number,
): TelemetrySample {
  return {
    bindingId: `binding-${id}`,
    metricBindingIds: ['v', 'i', 'p', 'e'],
    sourcePointId: point,
    sourceIdentity: 'EMU-BFDB-01',
    targetType: 'EQUIPMENT',
    targetId: id,
    entityId: id,
    entityKind: 'EQUIPMENT',
    receivedAt: at,
    reported: Object.fromEntries(
      Object.entries({ voltageV: volts, currentA: amps, powerW: power, energyKwh: energy }).map(
        ([key, value]) => [key, { value, unit: '', observedAt: at }],
      ),
    ),
  };
}

describe('canonical BDFB descendant LIVE telemetry', () => {
  it('averages the three commissioned descendants and sums their powers once', () => {
    const a = sample('cb-01', '0_1_1', 12.23, 13.81, 168.86, 0.3888);
    const b = sample('psu-0', '0_1_2', 12.23, 5.99, 73.22, 0.4081);
    const c = sample('psu-1', '0_1_3', 12.25, 4.15, 50.83, 0.3628);
    const output = aggregateBdfbDescendantTelemetry(
      [a, b, c, a, sample('unrelated', '0_3_1', 13, 4, 52, 1)],
      ['cb-01', 'psu-0', 'psu-1', 'panel', 'shelf'],
      now,
    );
    expect(output.descendantEquipment).toBe(5);
    expect(output.reportingEquipment).toBe(3);
    expect(output.withoutCurrentReading).toBe(2);
    expect(output.averageVoltageV).toBeCloseTo((12.23 + 12.23 + 12.25) / 3);
    expect(output.averageCurrentA).toBeCloseTo((13.81 + 5.99 + 4.15) / 3);
    expect(output.averagePowerW).toBeCloseTo(292.91 / 3);
    expect(output.totalPowerW).toBeCloseTo(292.91);
    expect(output.averageEnergyKwh).toBeCloseTo((0.3888 + 0.4081 + 0.3628) / 3);
    expect(output.powerReportingEquipment).toBe(3);
    expect(output.latestReceivedAt).toBe(at);
  });

  it('rejects RAW, unbound, stale and conflicting-source readings', () => {
    const mapped = sample('breaker', '0_1_1', 12, 5, 60, 1);
    const raw: TelemetrySample = {
      bindingId: 'auto:raw',
      sourcePointId: '0_1_2',
      targetId: 'panel',
      entityId: 'panel',
      targetType: 'EQUIPMENT',
      entityKind: 'EQUIPMENT',
      sourceIdentity: 'EMU-BFDB-01',
      receivedAt: at,
      reported: { '0_1_2': { U1: 12, P1: 10 } },
    };
    const old = { ...sample('old', '0_1_3', 12, 4, 48, 1), receivedAt: '2026-10-20T20:30:00.000Z' };
    const otherSource = {
      ...mapped,
      sourceIdentity: 'EMU-BFDB-02',
      sourcePointId: '0_1_2',
      reported: { ...mapped.reported, currentA: { value: 2, observedAt: at } },
    };
    const output = aggregateBdfbDescendantTelemetry(
      [mapped, raw, old, otherSource],
      ['breaker', 'panel', 'old'],
      now,
    );
    expect(output.reportingEquipment).toBe(0);
    expect(output.totalPowerW).toBeNull();
    expect(output.averageCurrentA).toBeNull();
    expect(output.withoutCurrentReading).toBe(3);
  });

  it('preserves true zero power without labeling missing measurements as zero', () => {
    const zero = sample('a', '0_1_1', 12, 0, 0, 0);
    const output = aggregateBdfbDescendantTelemetry([zero], ['a', 'b'], now);
    expect(output.reportingEquipment).toBe(1);
    expect(output.totalPowerW).toBe(0);
    expect(output.averageCurrentA).toBe(0);
  });
});
