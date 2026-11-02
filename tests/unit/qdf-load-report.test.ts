import { describe, expect, it } from 'vitest';

import { projectQdfLoadReport } from '@/modules/telemetry/application/qdf-load-report';

describe('QDF load report projection', () => {
  it('summarizes only the canonical qdf-vipe-v1 points without redefining them', () => {
    const contract = {
      contractVersion: 'qdf-vipe-v1',
      deviceId: 'qdf-01',
      scope: 'HISTORY',
      window: '24h',
      status: 'COMPLETE',
      metrics: {
        voltage: {
          unit: 'V',
          semantics: 'COHERENT_REPRESENTATIVE_A_B_BUS_VOLTAGE',
          quality: 'VALID',
          toleranceV: 1,
          busA: [],
          busB: [],
          total: [
            { bucketAt: '2026-11-01T00:00:00.000Z', observedAt: '2026-11-01T00:00:01.000Z', voltageV: 48, contributingFeeds: 4 },
            { bucketAt: '2026-11-01T00:05:00.000Z', observedAt: '2026-11-01T00:05:01.000Z', voltageV: 50, contributingFeeds: 4 },
          ],
        },
        current: {
          unit: 'A',
          semantics: 'SUM_VERIFIED_INDEPENDENT_INPUTS',
          quality: 'VALID',
          points: [
            { bucketAt: '2026-11-01T00:00:00.000Z', observedAt: '2026-11-01T00:00:01.000Z', currentA: 100, contributingFeeds: 4 },
            { bucketAt: '2026-11-01T00:05:00.000Z', observedAt: '2026-11-01T00:05:01.000Z', currentA: 140, contributingFeeds: 4 },
          ],
        },
        power: {
          unit: 'kW',
          semantics: 'SUM_VERIFIED_PAIRED_VOLTAGE_CURRENT',
          quality: 'VALID',
          points: [
            { bucketAt: '2026-11-01T00:00:00.000Z', observedAt: '2026-11-01T00:00:01.000Z', powerKw: 4.8, contributingFeeds: 4 },
            { bucketAt: '2026-11-01T00:05:00.000Z', observedAt: '2026-11-01T00:05:01.000Z', powerKw: 7, contributingFeeds: 4 },
          ],
        },
        energy: {
          unit: 'kWh',
          semantics: 'SUM_VERIFIED_FEED_ENERGY_OVER_OBSERVED_INTERVALS',
          source: 'DERIVED_FROM_PAIRED_VOLTAGE_CURRENT',
          temporalScope: 'WINDOW',
          quality: 'VALID',
          maxIntegratedGapSeconds: 120,
          points: [
            { bucketAt: '2026-11-01T00:00:00.000Z', observedAt: '2026-11-01T00:00:01.000Z', intervalEnergyKwh: 0.1, cumulativeEnergyKwh: 0.1, coveredSeconds: 60, contributingFeeds: 4 },
            { bucketAt: '2026-11-01T00:05:00.000Z', observedAt: '2026-11-01T00:05:01.000Z', intervalEnergyKwh: 0.2, cumulativeEnergyKwh: 0.3, coveredSeconds: 60, contributingFeeds: 4 },
          ],
          totalKwh: 0.3,
        },
      },
    } as const;

    const report = projectQdfLoadReport(contract);
    expect(report.metrics.voltage).toMatchObject({ average: 49, min: 48, max: 50 });
    expect(report.metrics.current).toMatchObject({ average: 120, peak: 140 });
    expect(report.metrics.power).toMatchObject({ average: 5.9, peak: 7 });
    expect(report.metrics.energy.total).toBe(0.3);
    expect(report.coverage.commonBuckets).toBe(2);
    expect(report.sourceContractVersion).toBe('qdf-vipe-v1');
  });
});
