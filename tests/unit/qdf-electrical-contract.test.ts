import { describe, expect, it } from 'vitest';

import {
  composeQdfHistoricalElectricalContract,
  composeQdfLiveElectricalContract,
} from '@/modules/telemetry/application/qdf-electrical-contract';

describe('unified QDF V/A/P/E contractual projection', () => {
  it('composes live V/A/P without recalculating the certified metric values', () => {
    const current = {
      currentA: 24,
      observedAt: '2026-11-02T01:00:00.000Z',
      contributingFeeds: 2,
    };
    const power = {
      powerKw: 1.152,
      observedAt: '2026-11-02T01:00:00.000Z',
      contributingFeeds: 2,
    };
    const voltageValue = {
      voltageV: -48,
      observedAt: '2026-11-02T01:00:00.000Z',
      contributingFeeds: 2,
    };
    const contract = composeQdfLiveElectricalContract('qdf-1', {
      current,
      power,
      voltage: { busA: voltageValue, busB: voltageValue, total: voltageValue },
    });

    expect(contract).toMatchObject({
      contractVersion: 'qdf-vipe-v1',
      deviceId: 'qdf-1',
      scope: 'LIVE',
      status: 'COMPLETE',
      metrics: {
        current: { quality: 'VALID', total: current },
        power: { quality: 'VALID', total: power },
        voltage: { quality: 'VALID', total: voltageValue },
        energy: { quality: 'UNAVAILABLE', temporalScope: 'WINDOW_ONLY', total: null },
      },
    });
  });

  it('reports PARTIAL without promoting missing live metrics to valid totals', () => {
    const current = {
      currentA: 24,
      observedAt: '2026-11-02T01:00:00.000Z',
      contributingFeeds: 2,
    };
    const contract = composeQdfLiveElectricalContract('qdf-1', {
      current,
      power: null,
      voltage: { busA: null, busB: null, total: null },
    });
    expect(contract.status).toBe('PARTIAL');
    expect(contract.metrics.current.quality).toBe('VALID');
    expect(contract.metrics.power.quality).toBe('UNAVAILABLE');
    expect(contract.metrics.voltage.quality).toBe('UNAVAILABLE');
  });

  it('composes historical V/A/P/E while preserving Energy as window-scoped E1', () => {
    const at = '2026-11-02T01:00:00.000Z';
    const current = [{ bucketAt: at, observedAt: at, currentA: 24, contributingFeeds: 2 }];
    const power = [{ bucketAt: at, observedAt: at, powerKw: 1.152, contributingFeeds: 2 }];
    const voltage = [{ bucketAt: at, observedAt: at, voltageV: -48, contributingFeeds: 2 }];
    const energy = [
      {
        bucketAt: at,
        observedAt: at,
        intervalEnergyKwh: 0.0192,
        cumulativeEnergyKwh: 0.0192,
        coveredSeconds: 60,
        contributingFeeds: 2,
      },
    ];
    const contract = composeQdfHistoricalElectricalContract('qdf-1', '24h', {
      current,
      power,
      voltage: { busA: voltage, busB: voltage, total: voltage },
      energy,
      voltageToleranceV: 1,
    });

    expect(contract.status).toBe('COMPLETE');
    expect(contract.metrics.energy).toMatchObject({
      quality: 'VALID',
      temporalScope: 'WINDOW',
      totalKwh: 0.0192,
    });
    expect(contract.metrics.current.points).toBe(current);
    expect(contract.metrics.power.points).toBe(power);
    expect(contract.metrics.voltage.total).toBe(voltage);
  });

  it('keeps independent per-metric quality when only part of history is available', () => {
    const contract = composeQdfHistoricalElectricalContract('qdf-1', '24h', {
      current: [],
      power: [],
      voltage: { busA: [], busB: [], total: [] },
      energy: [
        {
          bucketAt: '2026-11-02T01:00:00.000Z',
          observedAt: '2026-11-02T01:00:00.000Z',
          intervalEnergyKwh: 0.01,
          cumulativeEnergyKwh: 0.01,
          coveredSeconds: 60,
          contributingFeeds: 2,
        },
      ],
      voltageToleranceV: 1,
    });
    expect(contract.status).toBe('PARTIAL');
    expect(contract.metrics.energy.quality).toBe('VALID');
    expect(contract.metrics.current.quality).toBe('UNAVAILABLE');
  });
});
