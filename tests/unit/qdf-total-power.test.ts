import { describe, expect, it } from 'vitest';

import {
  projectHistoricalQdfTotalPower,
  projectVerifiedLiveTotalPower,
  type QdfLiveFeedPowerEvidence,
} from '@/modules/telemetry/application/qdf-total-power';
import type {
  SnmpBdfbFeedView,
  SnmpBdfbLoadView,
} from '@/modules/telemetry/application/snmp-feed-service';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

const observed = '2026-11-01T05:00:00.000Z';

function liveFeed(
  id: string,
  side: 'A' | 'B',
  estimatedPowerW: number,
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
    currentA: 10,
    voltageV: -48,
    observedAt: observed,
    sourceIdentity: 'ELTEK-01',
    currentOid: `1.3.6.1.current.${side}`,
    utilizationPct: null,
    estimatedPowerW,
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
    totalCurrentA: 20,
    measuredCurrentA: 20,
    totalRatedCurrentA: 1600,
    totalEstimatedPowerW: feeds.reduce((sum, feed) => sum + (feed.estimatedPowerW ?? 0), 0),
    feedCount: 2,
    freshFeedCount: 2,
    labFreshFeedCount: 0,
    labMeasuredCurrentA: null,
    feeds,
  };
}

function evidence(
  id: string,
  overrides: Partial<QdfLiveFeedPowerEvidence> = {},
): QdfLiveFeedPowerEvidence {
  return {
    accessPortId: id,
    sameSource: true,
    currentSourceMode: 'FIELD',
    voltageSourceMode: 'FIELD',
    currentObservedAt: observed,
    voltageObservedAt: observed,
    ...overrides,
  };
}

function bucket(bucketAt: string, powerW: number, at = bucketAt): SnmpHistoricalBucket {
  return {
    bucketAt,
    observedAt: at,
    currentA: null,
    voltageV: null,
    powerW,
    estimatedEnergyKwh: null,
    coveredSeconds: 0,
    sampleCount: 1,
  };
}

describe('QDF total power contractual projection', () => {
  it('converts a complete verified input-power sum to kW', () => {
    const result = projectVerifiedLiveTotalPower(
      load([liveFeed('feed-A', 'A', 480), liveFeed('feed-B', 'B', 528)]),
      [evidence('feed-A'), evidence('feed-B')],
    );
    expect(result).toEqual({
      powerKw: 1.008,
      observedAt: observed,
      contributingFeeds: 2,
    });
  });

  it('fails closed for synthetic, mismatched or time-skewed voltage/current evidence', () => {
    const base = load([liveFeed('feed-A', 'A', 480), liveFeed('feed-B', 'B', 528)]);
    expect(
      projectVerifiedLiveTotalPower(base, [
        evidence('feed-A'),
        evidence('feed-B', { voltageSourceMode: 'SYNTHETIC_LAB_ONLY' }),
      ]),
    ).toBeNull();
    expect(
      projectVerifiedLiveTotalPower(base, [
        evidence('feed-A'),
        evidence('feed-B', { sameSource: false }),
      ]),
    ).toBeNull();
    expect(
      projectVerifiedLiveTotalPower(base, [
        evidence('feed-A'),
        evidence('feed-B', { voltageObservedAt: '2026-11-01T05:00:06.000Z' }),
      ]),
    ).toBeNull();
  });

  it('sums historical power only when every verified FIELD feed shares an aligned bucket', () => {
    const at = '2026-11-01T05:00:00.000Z';
    const next = '2026-11-01T05:05:00.000Z';
    const total = projectHistoricalQdfTotalPower(
      [
        {
          accessPortId: 'feed-A',
          position: 'A',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, 480), bucket(next, 500)],
        },
        {
          accessPortId: 'feed-B',
          position: 'B',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, 528), bucket(next, 540)],
        },
      ],
      2,
      true,
    );
    expect(total.map((point) => point.powerKw)).toEqual([1.008, 1.04]);
  });

  it('does not emit a partial historical total', () => {
    const at = '2026-11-01T05:00:00.000Z';
    expect(
      projectHistoricalQdfTotalPower(
        [
          {
            accessPortId: 'feed-A',
            position: 'A',
            verified: true,
            sourceMode: 'FIELD',
            points: [bucket(at, 480)],
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
      ),
    ).toEqual([]);
  });
});
