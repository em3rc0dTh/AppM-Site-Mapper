import { describe, expect, it } from 'vitest';

import {
  projectOperationalHistoricalTotalCurrent,
  projectOperationalHistoricalTotalEnergy,
  projectOperationalHistoricalTotalPower,
  projectOperationalHistoricalVoltage,
  projectOperationalLiveTotalCurrent,
  projectOperationalLiveTotalPower,
  projectOperationalQdfVoltage,
} from '@/modules/telemetry/application/qdf-operational-projection';
import {
  projectHistoricalQdfTotalCurrent,
  projectVerifiedLiveTotalCurrent,
} from '@/modules/telemetry/application/qdf-total-current';
import { projectVerifiedQdfVoltage } from '@/modules/telemetry/application/qdf-total-voltage';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

const at = '2026-11-12T14:57:22.850Z';

function labLoad(): SnmpBdfbLoadView {
  return {
    deviceId: 'qdf-5',
    hardwareProfile: 'ELTEK_BDCBB_CONFIG_2',
    inventoryStatus: 'INCOMPLETE',
    expectedFeedCount: 2,
    missingFeedPositions: [],
    configurationIssues: ['SHUNT_NOT_VERIFIED_A', 'SHUNT_NOT_VERIFIED_B'],
    status: 'PARTIAL',
    totalCurrentA: null,
    measuredCurrentA: null,
    totalRatedCurrentA: null,
    totalEstimatedPowerW: null,
    feedCount: 2,
    freshFeedCount: 0,
    labFreshFeedCount: 2,
    labMeasuredCurrentA: 446.1,
    feeds: [
      {
        accessPortId: 'feed-A',
        label: 'SNMP INPUT A',
        side: 'A',
        feedPosition: null,
        overloadThresholdA: null,
        overloadWarning: null,
        ratedCurrentA: null,
        status: 'LAB_LIVE',
        currentA: 244.5,
        voltageV: -53.2,
        observedAt: at,
        sourceIdentity: 'EMU-DELTA-BFDB-03',
        currentOid: 'current-a',
        utilizationPct: null,
        estimatedPowerW: 244.5 * 53.2,
        servedPanelIds: ['panel-a'],
      },
      {
        accessPortId: 'feed-B',
        label: 'SNMP INPUT B',
        side: 'B',
        feedPosition: null,
        overloadThresholdA: null,
        overloadWarning: null,
        ratedCurrentA: null,
        status: 'LAB_LIVE',
        currentA: 201.6,
        voltageV: -53.3,
        observedAt: at,
        sourceIdentity: 'EMU-DELTA-BFDB-03',
        currentOid: 'current-b',
        utilizationPct: null,
        estimatedPowerW: 201.6 * 53.3,
        servedPanelIds: ['panel-b'],
      },
    ],
  };
}

function point(
  bucketAt: string,
  currentA: number,
  voltageV: number,
  energyKwh: number,
): SnmpHistoricalBucket {
  return {
    bucketAt,
    observedAt: bucketAt,
    currentA,
    voltageV,
    powerW: currentA * Math.abs(voltageV),
    estimatedEnergyKwh: energyKwh,
    coveredSeconds: 300,
    sampleCount: 50,
    pairedSampleCount: 50,
  };
}

describe('QDF operational projection', () => {
  it('projects complete synthetic live V/I/P without promoting it to certified evidence', () => {
    const load = labLoad();
    const voltageEvidence = load.feeds.map((feed) => ({
      accessPortId: feed.accessPortId,
      side: feed.side as 'A' | 'B',
      position: feed.side,
      verified: false,
      sourceMode: 'SYNTHETIC_LAB_ONLY' as const,
      voltageV: feed.voltageV,
      observedAt: feed.observedAt,
    }));

    expect(projectOperationalLiveTotalCurrent(load)?.currentA).toBeCloseTo(446.1);
    expect(projectOperationalLiveTotalPower(load)?.powerKw).toBeCloseTo(23.76072);
    expect(projectOperationalQdfVoltage(voltageEvidence, 2).total?.voltageV).toBeCloseTo(-53.25);

    expect(projectVerifiedLiveTotalCurrent(load)).toBeNull();
    expect(projectVerifiedQdfVoltage(voltageEvidence, 2, true, 1).total).toBeNull();
  });

  it('projects synthetic historical V/I/P/E while certified history stays unavailable', () => {
    const bucket = '2026-11-12T14:55:00.000Z';
    const feeds = [
      {
        accessPortId: 'feed-A',
        side: 'A' as const,
        position: 'A',
        verified: false,
        sourceMode: 'SYNTHETIC_LAB_ONLY' as const,
        points: [point(bucket, 244.5, -53.2, 1.1)],
      },
      {
        accessPortId: 'feed-B',
        side: 'B' as const,
        position: 'B',
        verified: false,
        sourceMode: 'SYNTHETIC_LAB_ONLY' as const,
        points: [point(bucket, 201.6, -53.3, 0.9)],
      },
    ];

    expect(projectOperationalHistoricalTotalCurrent(feeds, 2)[0]?.currentA).toBeCloseTo(446.1);
    expect(projectOperationalHistoricalTotalPower(feeds, 2)[0]?.powerKw).toBeCloseTo(23.76072);
    expect(projectOperationalHistoricalTotalEnergy(feeds, 2)[0]?.intervalEnergyKwh).toBeCloseTo(2);
    expect(projectOperationalHistoricalVoltage(feeds, 2).total[0]?.voltageV).toBeCloseTo(-53.25);

    expect(projectHistoricalQdfTotalCurrent(feeds, 2, false)).toEqual([]);
  });
});
