import { describe, expect, it } from 'vitest';

import { projectHistoricalQdfTotalEnergy } from '@/modules/telemetry/application/qdf-total-energy';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

function bucket(
  bucketAt: string,
  estimatedEnergyKwh: number | null,
  coveredSeconds = 60,
  sampleCount = 2,
): SnmpHistoricalBucket {
  return {
    bucketAt,
    observedAt: bucketAt,
    currentA: 10,
    voltageV: -48,
    powerW: 480,
    estimatedEnergyKwh,
    coveredSeconds,
    sampleCount,
    pairedSampleCount: sampleCount,
  };
}

function feed(
  id: string,
  position: string,
  points: readonly SnmpHistoricalBucket[],
  overrides: Partial<{
    verified: boolean;
    sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  }> = {},
) {
  return {
    accessPortId: id,
    position,
    verified: true,
    sourceMode: 'FIELD' as const,
    points,
    ...overrides,
  };
}

describe('QDF total energy E1 contractual projection', () => {
  it('sums aligned verified FIELD feed energy and exposes a window cumulative total', () => {
    const first = '2026-11-01T05:00:00.000Z';
    const second = '2026-11-01T05:05:00.000Z';
    const result = projectHistoricalQdfTotalEnergy(
      [
        feed('feed-A', 'A', [bucket(first, 0.01), bucket(second, 0.015)]),
        feed('feed-B', 'B', [bucket(first, 0.02), bucket(second, 0.025)]),
      ],
      2,
      true,
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.intervalEnergyKwh).toBeCloseTo(0.03, 10);
    expect(result[0]?.cumulativeEnergyKwh).toBeCloseTo(0.03, 10);
    expect(result[1]?.intervalEnergyKwh).toBeCloseTo(0.04, 10);
    expect(result[1]?.cumulativeEnergyKwh).toBeCloseTo(0.07, 10);
    expect(result[1]).toMatchObject({
      coveredSeconds: 60,
      contributingFeeds: 2,
    });
  });

  it('fails closed for LAB or unverified feed evidence', () => {
    const at = '2026-11-01T05:00:00.000Z';
    expect(
      projectHistoricalQdfTotalEnergy(
        [
          feed('feed-A', 'A', [bucket(at, 0.01)]),
          feed('feed-B', 'B', [bucket(at, 0.02)], {
            sourceMode: 'SYNTHETIC_LAB_ONLY',
          }),
        ],
        2,
        true,
      ),
    ).toEqual([]);
    expect(
      projectHistoricalQdfTotalEnergy(
        [
          feed('feed-A', 'A', [bucket(at, 0.01)]),
          feed('feed-B', 'B', [bucket(at, 0.02)], { verified: false }),
        ],
        2,
        true,
      ),
    ).toEqual([]);
  });

  it('omits a bucket with incomplete V/I pairing or mismatched feed coverage', () => {
    const good = '2026-11-01T05:00:00.000Z';
    const bad = '2026-11-01T05:05:00.000Z';
    const incomplete = {
      ...bucket(bad, 0.015, 60, 2),
      pairedSampleCount: 1,
    };
    const result = projectHistoricalQdfTotalEnergy(
      [
        feed('feed-A', 'A', [bucket(good, 0.01), incomplete]),
        feed('feed-B', 'B', [bucket(good, 0.02), bucket(bad, 0.025)]),
      ],
      2,
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.bucketAt).toBe(good);

    expect(
      projectHistoricalQdfTotalEnergy(
        [
          feed('feed-A', 'A', [bucket(good, 0.01, 60, 2)]),
          feed('feed-B', 'B', [bucket(good, 0.02, 30, 1)]),
        ],
        2,
        true,
      ),
    ).toEqual([]);
  });

  it('does not fabricate a partial bucket when an expected feed has no matching history', () => {
    const at = '2026-11-01T05:00:00.000Z';
    expect(
      projectHistoricalQdfTotalEnergy(
        [feed('feed-A', 'A', [bucket(at, 0.01)]), feed('feed-B', 'B', [])],
        2,
        true,
      ),
    ).toEqual([]);
  });
});
