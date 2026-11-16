import { describe, expect, it } from 'vitest';

import {
  projectHistoricalQdfVoltage,
  projectVerifiedQdfVoltage,
  qdfVoltageToleranceV,
  type QdfVoltageFeedEvidence,
} from '@/modules/telemetry/application/qdf-total-voltage';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

const at = '2026-11-01T05:00:00.000Z';

function feed(
  id: string,
  side: 'A' | 'B',
  voltageV: number,
  position: string = side,
): QdfVoltageFeedEvidence {
  return {
    accessPortId: id,
    side,
    position,
    verified: true,
    sourceMode: 'FIELD',
    voltageV,
    observedAt: at,
  };
}

function bucket(bucketAt: string, voltageV: number, observedAt = bucketAt): SnmpHistoricalBucket {
  return {
    bucketAt,
    observedAt,
    currentA: null,
    voltageV,
    powerW: null,
    estimatedEnergyKwh: null,
    coveredSeconds: 0,
    sampleCount: 1,
  };
}

describe('QDF canonical voltage projection', () => {
  it('derives Bus A, Bus B and TOTAL without summing voltage', () => {
    const result = projectVerifiedQdfVoltage(
      [feed('feed-A', 'A', -53.2), feed('feed-B', 'B', -53.0)],
      2,
      true,
      1,
    );
    expect(result.busA?.voltageV).toBe(-53.2);
    expect(result.busB?.voltageV).toBe(-53);
    expect(result.total?.voltageV).toBeCloseTo(-53.1, 8);
    expect(result.total?.contributingFeeds).toBe(2);
  });

  it('keeps coherent bus voltages but withholds TOTAL when A/B disagree', () => {
    const result = projectVerifiedQdfVoltage(
      [feed('feed-A', 'A', -53.2), feed('feed-B', 'B', -50)],
      2,
      true,
      1,
    );
    expect(result.busA?.voltageV).toBe(-53.2);
    expect(result.busB?.voltageV).toBe(-50);
    expect(result.total).toBeNull();
  });

  it('averages only coherent same-bus feed measurements for Config 4', () => {
    const result = projectVerifiedQdfVoltage(
      [
        feed('feed-A1', 'A', -53.2, 'A1'),
        feed('feed-A2', 'A', -53.0, 'A2'),
        feed('feed-B1', 'B', -53.1, 'B1'),
        feed('feed-B2', 'B', -52.9, 'B2'),
      ],
      4,
      true,
      0.5,
    );
    expect(result.busA?.voltageV).toBeCloseTo(-53.1, 8);
    expect(result.busA?.contributingFeeds).toBe(2);
    expect(result.busB?.voltageV).toBeCloseTo(-53, 8);
    expect(result.total?.voltageV).toBeCloseTo(-53.05, 8);
    expect(result.total?.contributingFeeds).toBe(4);
  });

  it('fails closed for incomplete, LAB, duplicate or uncommissioned tolerance evidence', () => {
    const complete = [feed('feed-A', 'A', -53.2), feed('feed-B', 'B', -53.0)];
    expect(projectVerifiedQdfVoltage(complete, 2, false, 1).total).toBeNull();
    expect(
      projectVerifiedQdfVoltage(
        [complete[0]!, { ...complete[1]!, sourceMode: 'SYNTHETIC_LAB_ONLY' }],
        2,
        true,
        1,
      ).total,
    ).toBeNull();
    expect(
      projectVerifiedQdfVoltage(
        [complete[0]!, { ...complete[1]!, accessPortId: 'feed-A' }],
        2,
        true,
        1,
      ).total,
    ).toBeNull();
    expect(projectVerifiedQdfVoltage(complete, 2, true, 0).total).toBeNull();
    expect(qdfVoltageToleranceV(undefined)).toBeNull();
    expect(qdfVoltageToleranceV({ qdfVoltageToleranceV: 0.75 })).toBe(0.75);
  });

  it('projects historical TOTAL only from buckets shared by every expected feed', () => {
    const first = '2026-11-01T05:00:00.000Z';
    const second = '2026-11-01T05:05:00.000Z';
    const result = projectHistoricalQdfVoltage(
      [
        {
          accessPortId: 'feed-A',
          side: 'A',
          position: 'A',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(first, -53.2), bucket(second, -53.1)],
        },
        {
          accessPortId: 'feed-B',
          side: 'B',
          position: 'B',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(first, -53.0)],
        },
      ],
      2,
      true,
      1,
    );
    expect(result.total).toHaveLength(1);
    expect(result.total[0]?.bucketAt).toBe(first);
    expect(result.total[0]?.voltageV).toBeCloseTo(-53.1, 8);
  });

  it('withholds historical TOTAL on bus mismatch while retaining each bus value', () => {
    const result = projectHistoricalQdfVoltage(
      [
        {
          accessPortId: 'feed-A',
          side: 'A',
          position: 'A',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, -53.2)],
        },
        {
          accessPortId: 'feed-B',
          side: 'B',
          position: 'B',
          verified: true,
          sourceMode: 'FIELD',
          points: [bucket(at, -49)],
        },
      ],
      2,
      true,
      1,
    );
    expect(result.busA).toHaveLength(1);
    expect(result.busB).toHaveLength(1);
    expect(result.total).toEqual([]);
  });
});
