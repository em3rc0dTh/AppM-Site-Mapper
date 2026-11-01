import { describe, expect, it } from 'vitest';

import {
  projectHistoricalQdfTotalCurrent,
  projectVerifiedLiveTotalCurrent,
} from '@/modules/telemetry/application/qdf-total-current';
import type {
  SnmpBdfbFeedView,
  SnmpBdfbLoadView,
} from '@/modules/telemetry/application/snmp-feed-service';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

const observed = '2026-11-01T05:00:00.000Z';

function liveFeed(
  id: string,
  side: 'A' | 'B',
  currentA: number,
  at = observed,
): SnmpBdfbFeedView {
  return {
    accessPortId: id,
    label: `Feed ${side}`,
    side,
    feedPosition: null,
    overloadThresholdA: null,
    overloadWarning: null,
    ratedCurrentA: 800,
    status: 'LIVE',
    currentA,
    voltageV: null,
    observedAt: at,
    sourceIdentity: 'ELTEK-01',
    currentOid: `1.3.6.1.4.1.12148.10.10.18.4.1.6.${side === 'A' ? 1 : 2}.1`,
    utilizationPct: null,
    estimatedPowerW: null,
    servedPanelIds: [],
  };
}

function load(feeds: SnmpBdfbFeedView[]): SnmpBdfbLoadView {
  return {
    deviceId: 'qdf-2',
    hardwareProfile: 'ELTEK_BDCBB_CONFIG_2',
    inventoryStatus: 'COMPLETE',
    expectedFeedCount: 2,
    missingFeedPositions: [],
    configurationIssues: [],
    status: 'COMPLETE',
    totalCurrentA: feeds.reduce((sum, feed) => sum + (feed.currentA ?? 0), 0),
    measuredCurrentA: feeds.reduce((sum, feed) => sum + (feed.currentA ?? 0), 0),
    totalRatedCurrentA: 1600,
    totalEstimatedPowerW: null,
    feedCount: 2,
    freshFeedCount: 2,
    labFreshFeedCount: 0,
    labMeasuredCurrentA: null,
    feeds,
  };
}

function bucket(bucketAt: string, currentA: number, at = bucketAt): SnmpHistoricalBucket {
  return {
    bucketAt,
    observedAt: at,
    currentA,
    voltageV: null,
    powerW: null,
    estimatedEnergyKwh: null,
    coveredSeconds: 0,
    sampleCount: 1,
  };
}

describe('QDF total current contractual projection', () => {
  it('uses the existing complete field total and requires aligned independent feeds', () => {
    const result = projectVerifiedLiveTotalCurrent(
      load([liveFeed('feed-A', 'A', 220), liveFeed('feed-B', 'B', 210)]),
    );
    expect(result).toEqual({
      currentA: 430,
      observedAt: observed,
      contributingFeeds: 2,
    });

    const skewed = projectVerifiedLiveTotalCurrent(
      load([
        liveFeed('feed-A', 'A', 220, observed),
        liveFeed('feed-B', 'B', 210, '2026-11-01T05:00:06.000Z'),
      ]),
    );
    expect(skewed).toBeNull();
  });

  it('fails closed for incomplete, duplicate or laboratory totals', () => {
    expect(
      projectVerifiedLiveTotalCurrent({
        ...load([liveFeed('feed-A', 'A', 220), liveFeed('feed-B', 'B', 210)]),
        status: 'PARTIAL',
        totalCurrentA: null,
      }),
    ).toBeNull();

    const duplicate = liveFeed('feed-A', 'B', 210);
    expect(
      projectVerifiedLiveTotalCurrent(load([liveFeed('feed-A', 'A', 220), duplicate])),
    ).toBeNull();

    const lab = { ...liveFeed('feed-B', 'B', 210), status: 'LAB_LIVE' as const };
    expect(
      projectVerifiedLiveTotalCurrent(load([liveFeed('feed-A', 'A', 220), lab])),
    ).toBeNull();
  });

  it('sums historical current only when every verified FIELD feed shares an aligned bucket', () => {
    const at = '2026-11-01T05:00:00.000Z';
    const next = '2026-11-01T05:05:00.000Z';
    const total = projectHistoricalQdfTotalCurrent(
      [
        {
          accessPortId: 'feed-A',
          position: 'A',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, 220), bucket(next, 225)],
        },
        {
          accessPortId: 'feed-B',
          position: 'B',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, 210), bucket(next, 215)],
        },
      ],
      2,
      true,
    );
    expect(total.map((point) => point.currentA)).toEqual([430, 440]);
    expect(total.every((point) => point.contributingFeeds === 2)).toBe(true);
  });

  it('does not emit a partial historical total', () => {
    const at = '2026-11-01T05:00:00.000Z';
    const result = projectHistoricalQdfTotalCurrent(
      [
        {
          accessPortId: 'feed-A',
          position: 'A',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, 220)],
        },
        {
          accessPortId: 'feed-B',
          position: 'B',
          verified: true,
          sourceMode: 'FIELD',
          points: [],
        },
      ],
      2,
      true,
    );
    expect(result).toEqual([]);
  });
});
