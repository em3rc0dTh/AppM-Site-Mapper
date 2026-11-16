import { describe, expect, it } from 'vitest';

import {
  projectSnmpCapacity,
  projectSnmpFeedCapacity,
} from '@/modules/telemetry/application/snmp-capacity-projection';
import type {
  SnmpBdfbFeedView,
  SnmpBdfbLoadView,
} from '@/modules/telemetry/application/snmp-feed-service';

function feed(
  id: string,
  side: string,
  amps: number | null,
  rated: number | null,
  status: SnmpBdfbFeedView['status'] = 'LAB_LIVE',
): SnmpBdfbFeedView {
  return {
    accessPortId: id,
    label: `Shunt ${side}`,
    feedPosition: null,
    side,
    status,
    currentA: amps,
    ratedCurrentA: rated,
    voltageV: null,
    observedAt: '2026-10-22T18:00:00.000Z',
    sourceIdentity: 'EMU-DELTA-BFDB-01',
    currentOid: '1.3.6.1.4.1.8072.9999.2026.48.1.1.0',
    utilizationPct: null,
    overloadThresholdA: null,
    overloadWarning: null,
    estimatedPowerW: null,
    servedPanelIds: [`panel-${side}`],
  };
}

function view(feeds: SnmpBdfbFeedView[], expectedFeedCount = 2): SnmpBdfbLoadView {
  return {
    deviceId: 'bdfb-01',
    hardwareProfile: 'ELTEK_BDCBB_CONFIG_2',
    inventoryStatus: 'INCOMPLETE',
    expectedFeedCount,
    missingFeedPositions: [],
    configurationIssues: ['SHUNT_NOT_VERIFIED_A'],
    status: 'PARTIAL',
    totalCurrentA: null,
    measuredCurrentA: null,
    totalRatedCurrentA: null,
    totalEstimatedPowerW: null,
    feedCount: feeds.length,
    freshFeedCount: 0,
    labFreshFeedCount: feeds.filter((f) => f.status === 'LAB_LIVE').length,
    labMeasuredCurrentA: null,
    feeds,
  };
}

describe('SNMP lab simulated DC utilization', () => {
  it('uses only recorded nominal ratings, not the certified total fields', () => {
    const result = projectSnmpCapacity(
      view([feed('feed-A', 'A', 150, 800), feed('feed-B', 'B', 291.6, 800)]),
    );
    expect(result.mode).toBe('LAB_SIMULATED');
    expect(result.reportingFeeds).toBe(2);
    expect(result.measuredA).toBeCloseTo(441.6);
    expect(result.ratedA).toBe(1600);
    expect(result.utilizationPct).toBeCloseTo(27.6);
    expect(result.availableA).toBeCloseTo(1158.4);
    expect(result.feedUtilization[0]).toMatchObject({
      measuredA: 150,
      ratedA: 800,
      availableA: 650,
      utilizationPct: 18.75,
    });
  });

  it('never invents 800 A when an input rating is missing', () => {
    const result = projectSnmpCapacity(
      view([feed('feed-A', 'A', 150, 800), feed('feed-B', 'B', 291.6, null)]),
    );
    expect(result.measuredA).toBeCloseTo(441.6);
    expect(result.ratedA).toBeNull();
    expect(result.availableA).toBeNull();
    expect(result.utilizationPct).toBeNull();
    expect(result.feedUtilization[1]?.ratedA).toBeNull();
  });

  it('withholds whole BDFB totals for a stale, missing or duplicate shunt', () => {
    for (const list of [
      [feed('feed-A', 'A', 150, 800)],
      [feed('feed-A', 'A', 150, 800), feed('feed-B', 'B', null, 800, 'STALE')],
      [feed('feed-A', 'A', 150, 800), feed('feed-A', 'B', 291.6, 800)],
      [feed('feed-A', 'A', 150, 800), feed('feed-B', 'A', 291.6, 800)],
    ]) {
      const result = projectSnmpCapacity(view(list));
      expect(result.measuredA).toBeNull();
      expect(result.availableA).toBeNull();
    }
  });

  it('does not mix physical LIVE with LAB_LIVE in the same total', () => {
    const result = projectSnmpCapacity(
      view([feed('feed-A', 'A', 150, 800, 'LIVE'), feed('feed-B', 'B', 200, 800)]),
    );
    expect(result.mode).toBe('MIXED');
    expect(result.utilizationPct).toBeNull();
    expect(result.availableA).toBeNull();
  });

  it('requires server-certified complete status for physical LIVE totals', () => {
    const feeds = [feed('feed-A', 'A', 150, 800, 'LIVE'), feed('feed-B', 'B', 200, 800, 'LIVE')];
    const incomplete = projectSnmpCapacity(view(feeds));
    expect(incomplete.measuredA).toBeNull();
    const complete = projectSnmpCapacity({
      ...view(feeds),
      status: 'COMPLETE',
      inventoryStatus: 'COMPLETE',
      totalCurrentA: 350,
    });
    expect(complete.mode).toBe('VERIFIED_LIVE');
    expect(complete.availableA).toBe(1250);
  });

  it('shows overrating without reporting negative free capacity', () => {
    const result = projectSnmpFeedCapacity(feed('feed-A', 'A', 900, 800));
    expect(result.utilizationPct).toBe(112.5);
    expect(result.availableA).toBe(0);
    expect(result.overloadedByA).toBe(100);
  });

  it('accepts measured zero current as a real fresh laboratory reading', () => {
    const result = projectSnmpCapacity(
      view([feed('feed-A', 'A', 0, 800), feed('feed-B', 'B', 0, 800)]),
    );
    expect(result.measuredA).toBe(0);
    expect(result.utilizationPct).toBe(0);
    expect(result.availableA).toBe(1600);
  });
});
