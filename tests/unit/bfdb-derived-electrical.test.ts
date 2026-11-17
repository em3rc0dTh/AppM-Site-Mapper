import { describe, expect, it } from 'vitest';

import {
  BFDB_DERIVED_ENERGY_FORMULA,
  BFDB_DERIVED_POWER_FORMULA,
  BfdbDerivedElectricalEngine,
} from '@/modules/telemetry/application/bfdb-derived-electrical';
import type { TelemetryHistoryWriter } from '@/modules/telemetry/application/telemetry-history-writer';
import type {
  BreakerTelemetryReading,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

const sourceIdentity = '26092403950002';
const breakerId = 'breaker-b3-01';
const t0 = '2026-11-17T15:30:00.000Z';
const t60 = '2026-11-17T15:31:00.000Z';

function reading(
  voltageV: number,
  currentA: number,
  receivedAt: string,
): BreakerTelemetryReading {
  return {
    deviceId: 'qdf5',
    sourceIdentity,
    shelfId: 'shelf',
    frameId: 'frame',
    panelId: 'panel-b3',
    panelLabel: 'B3',
    breakerId,
    breakerLabel: 'B3-01',
    rawPointId: '0_5_1',
    modbusPointId: '0_2_1',
    position: 1,
    receivedAt,
    metrics: {
      voltageV: { value: voltageV, observedAt: receivedAt, origin: 'SOURCE' },
      currentA: { value: currentA, observedAt: receivedAt, origin: 'SOURCE' },
      // Deliberately bogus device values: the engine must replace them.
      powerW: { value: 9999, observedAt: receivedAt, origin: 'SOURCE' },
      energyKwh: { value: 9999, observedAt: receivedAt, origin: 'SOURCE' },
    },
  };
}

function pointSample(
  voltageV: number,
  currentA: number,
  receivedAt: string,
  messageId?: string,
): TelemetrySample {
  return {
    bindingId: 'binding-voltage',
    metricBindingIds: ['binding-voltage', 'binding-current', 'binding-power', 'binding-energy'],
    sourcePointId: '0_5_1',
    targetId: breakerId,
    targetType: 'EQUIPMENT',
    entityId: breakerId,
    entityKind: 'EQUIPMENT',
    sourceIdentity,
    protocol: 'BFDB',
    receivedAt,
    ...(messageId ? { messageId } : {}),
    reported: {
      voltageV: { value: voltageV, unit: 'V', observedAt: receivedAt, origin: 'SOURCE' },
      currentA: { value: currentA, unit: 'A', observedAt: receivedAt, origin: 'SOURCE' },
      powerW: { value: 9999, unit: 'W', observedAt: receivedAt, origin: 'SOURCE' },
      energyKwh: { value: 9999, unit: 'kWh', observedAt: receivedAt, origin: 'SOURCE' },
    },
  };
}

describe('BFDB derived electrical engine', () => {
  it('derives DC power from same-frame V/I and integrates energy trapezoidally', async () => {
    const engine = new BfdbDerivedElectricalEngine(undefined, 120_000);

    const first = await engine.applyBreakerReadings([reading(48, 2, t0)], 'm1');
    expect(first[0]?.metrics.powerW).toMatchObject({
      value: 96,
      origin: 'DERIVED',
      formula: BFDB_DERIVED_POWER_FORMULA,
    });
    expect(first[0]?.metrics.energyKwh).toMatchObject({
      value: 0,
      origin: 'DERIVED',
      formula: BFDB_DERIVED_ENERGY_FORMULA,
      quality: 'PARTIAL',
    });

    const second = await engine.applyBreakerReadings([reading(48, 4, t60)], 'm2');
    expect(second[0]?.metrics.powerW?.value).toBe(192);
    expect(second[0]?.metrics.energyKwh?.value).toBeCloseTo(0.0024, 10);
    expect(second[0]?.metrics.energyKwh?.quality).toBe('ESTIMATED');
  });

  it('does not interpolate long gaps and preserves explicit zeroes', async () => {
    const engine = new BfdbDerivedElectricalEngine(undefined, 120_000);
    await engine.applyBreakerReadings([reading(48, 2, t0)], 'm1');
    const second = await engine.applyBreakerReadings([reading(48, 4, t60)], 'm2');

    const afterGap = await engine.applyBreakerReadings(
      [reading(0, 0, '2026-11-17T15:34:00.000Z')],
      'm3',
    );
    expect(afterGap[0]?.metrics.powerW?.value).toBe(0);
    expect(afterGap[0]?.metrics.energyKwh?.value).toBeCloseTo(
      second[0]!.metrics.energyKwh!.value,
      10,
    );
  });

  it('replaces device P/EP in point LIVE state and avoids duplicate integration', async () => {
    const engine = new BfdbDerivedElectricalEngine(undefined, 120_000);
    const first = await engine.applyEquipmentSamples([pointSample(48, 2, t0, 'm1')]);
    const duplicate = await engine.applyEquipmentSamples([
      pointSample(48, 2, '2026-11-17T15:30:30.000Z', 'm1'),
    ]);

    expect(first[0]?.reported.powerW).toMatchObject({
      value: 96,
      unit: 'W',
      origin: 'DERIVED',
      formula: BFDB_DERIVED_POWER_FORMULA,
    });
    expect(first[0]?.reported.energyKwh).toMatchObject({
      value: 0,
      unit: 'kWh',
      origin: 'DERIVED',
      formula: BFDB_DERIVED_ENERGY_FORMULA,
    });
    expect(duplicate[0]?.reported.energyKwh).toMatchObject({ value: 0 });
  });

  it('restores the derived energy accumulator from historian state after restart', async () => {
    const previous: TelemetrySample = {
      ...pointSample(48, 2, t0, 'm1'),
      reported: {
        voltageV: { value: 48, unit: 'V', observedAt: t0, origin: 'SOURCE' },
        currentA: { value: 2, unit: 'A', observedAt: t0, origin: 'SOURCE' },
        powerW: {
          value: 96,
          unit: 'W',
          observedAt: t0,
          origin: 'DERIVED',
          formula: BFDB_DERIVED_POWER_FORMULA,
        },
        energyKwh: {
          value: 1.5,
          unit: 'kWh',
          observedAt: t0,
          origin: 'DERIVED',
          formula: BFDB_DERIVED_ENERGY_FORMULA,
        },
      },
    };
    const history: TelemetryHistoryWriter = {
      async write() {},
      async queryLatestEntities() {
        return [previous];
      },
    };
    const engine = new BfdbDerivedElectricalEngine(history, 120_000);
    const resumed = await engine.applyEquipmentSamples([pointSample(48, 4, t60, 'm2')]);

    const energy = (resumed[0]?.reported.energyKwh as { value: number } | undefined)?.value;
    expect(energy).toBeCloseTo(1.5024, 10);
  });
});
