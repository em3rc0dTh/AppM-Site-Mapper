import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import type {
  QdfHistoricalFeedCurrent,
  QdfLiveTotalCurrent,
  QdfTotalCurrentPoint,
} from '@/modules/telemetry/application/qdf-total-current';
import type {
  QdfHistoricalFeedEnergy,
  QdfTotalEnergyPoint,
} from '@/modules/telemetry/application/qdf-total-energy';
import type {
  QdfHistoricalFeedPower,
  QdfLiveTotalPower,
  QdfTotalPowerPoint,
} from '@/modules/telemetry/application/qdf-total-power';
import type {
  QdfHistoricalVoltageFeed,
  QdfVoltageFeedEvidence,
  QdfVoltageHistoryPoint,
  QdfVoltageSnapshot,
  QdfHistoricalVoltageProjection,
} from '@/modules/telemetry/application/qdf-total-voltage';

const finiteCurrent = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const finitePower = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const finiteVoltage = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const finiteEnergy = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const finiteCoverage = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function freshOperationalStatus(status: string): boolean {
  return status === 'LIVE' || status === 'LAB_LIVE';
}

function validIdentity(
  feeds: readonly { accessPortId: string; position: string | null }[],
  expectedFeedCount: number,
): boolean {
  if (expectedFeedCount < 1 || feeds.length !== expectedFeedCount) return false;
  const ids = feeds.map((feed) => feed.accessPortId);
  const positions = feeds.map((feed) => feed.position);
  return (
    new Set(ids).size === ids.length &&
    positions.every((position) => Boolean(position)) &&
    new Set(positions).size === positions.length
  );
}

function loadIdentity(load: SnmpBdfbLoadView): boolean {
  return validIdentity(
    load.feeds.map((feed) => ({
      accessPortId: feed.accessPortId,
      position: feed.feedPosition ?? feed.side,
    })),
    load.expectedFeedCount,
  );
}

function alignedObservedAt(values: readonly (string | null)[], maxSkewMs: number): string | null {
  const parsed = values.map((value) => Date.parse(value ?? ''));
  if (parsed.some((value) => !Number.isFinite(value))) return null;
  if (Math.max(...parsed) - Math.min(...parsed) > maxSkewMs) return null;
  return new Date(Math.max(...parsed)).toISOString();
}

/**
 * Operational projection is source-agnostic by design.
 * FIELD/SYNTHETIC provenance remains available on the source evidence, but does
 * not suppress otherwise valid telemetry in customer-facing operational views.
 */
export function projectOperationalLiveTotalCurrent(
  load: SnmpBdfbLoadView,
  maxSkewMs = 5_000,
): QdfLiveTotalCurrent | null {
  if (
    !loadIdentity(load) ||
    load.feeds.some((feed) => !freshOperationalStatus(feed.status) || !finiteCurrent(feed.currentA))
  )
    return null;

  const observedAt = alignedObservedAt(
    load.feeds.map((feed) => feed.observedAt),
    maxSkewMs,
  );
  if (!observedAt) return null;

  return {
    currentA: load.feeds.reduce((sum, feed) => sum + feed.currentA!, 0),
    observedAt,
    contributingFeeds: load.feeds.length,
  };
}

export function projectOperationalLiveTotalPower(
  load: SnmpBdfbLoadView,
  maxSkewMs = 5_000,
): QdfLiveTotalPower | null {
  if (
    !loadIdentity(load) ||
    load.feeds.some(
      (feed) => !freshOperationalStatus(feed.status) || !finitePower(feed.estimatedPowerW),
    )
  )
    return null;

  const observedAt = alignedObservedAt(
    load.feeds.map((feed) => feed.observedAt),
    maxSkewMs,
  );
  if (!observedAt) return null;

  return {
    powerKw: load.feeds.reduce((sum, feed) => sum + feed.estimatedPowerW!, 0) / 1000,
    observedAt,
    contributingFeeds: load.feeds.length,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function operationalVoltageSide(
  feeds: readonly QdfVoltageFeedEvidence[],
  side: 'A' | 'B',
): QdfVoltageSnapshot['busA'] {
  const selected = feeds.filter((feed) => feed.side === side);
  if (!selected.length || selected.some((feed) => !finiteVoltage(feed.voltageV))) return null;
  const observedAt = alignedObservedAt(
    selected.map((feed) => feed.observedAt),
    5_000,
  );
  if (!observedAt) return null;
  return {
    voltageV: average(selected.map((feed) => feed.voltageV!)),
    observedAt,
    contributingFeeds: selected.length,
  };
}

export function projectOperationalQdfVoltage(
  feeds: readonly QdfVoltageFeedEvidence[],
  expectedFeedCount: number,
  maxSkewMs = 5_000,
): QdfVoltageSnapshot {
  const unavailable: QdfVoltageSnapshot = { busA: null, busB: null, total: null };
  if (
    !validIdentity(
      feeds.map((feed) => ({
        accessPortId: feed.accessPortId,
        position: feed.position ?? feed.side,
      })),
      expectedFeedCount,
    ) ||
    feeds.some((feed) => !feed.side || !finiteVoltage(feed.voltageV))
  )
    return unavailable;

  if (
    !alignedObservedAt(
      feeds.map((feed) => feed.observedAt),
      maxSkewMs,
    )
  )
    return unavailable;

  const busA = operationalVoltageSide(feeds, 'A');
  const busB = operationalVoltageSide(feeds, 'B');
  if (!busA || !busB) return { busA, busB, total: null };

  return {
    busA,
    busB,
    total: {
      voltageV: average([busA.voltageV, busB.voltageV]),
      observedAt: new Date(
        Math.max(Date.parse(busA.observedAt), Date.parse(busB.observedAt)),
      ).toISOString(),
      contributingFeeds: busA.contributingFeeds + busB.contributingFeeds,
    },
  };
}

export function projectOperationalHistoricalTotalCurrent(
  feeds: readonly QdfHistoricalFeedCurrent[],
  expectedFeedCount: number,
  maxObservedSkewMs = 120_000,
): readonly QdfTotalCurrentPoint[] {
  if (!validIdentity(feeds, expectedFeedCount)) return [];
  const byFeed = feeds.map(
    (feed) => new Map(feed.points.map((point) => [point.bucketAt, point] as const)),
  );
  const candidateBuckets = [...byFeed[0]!.keys()].filter((bucketAt) =>
    byFeed.every((series) => series.has(bucketAt)),
  );

  return candidateBuckets.flatMap((bucketAt) => {
    const points = byFeed.map((series) => series.get(bucketAt)!);
    if (points.some((point) => !finiteCurrent(point.currentA))) return [];
    const observedAt = alignedObservedAt(
      points.map((point) => point.observedAt),
      maxObservedSkewMs,
    );
    if (!observedAt) return [];
    return [
      {
        bucketAt,
        observedAt,
        currentA: points.reduce((sum, point) => sum + point.currentA!, 0),
        contributingFeeds: points.length,
      },
    ];
  });
}

export function projectOperationalHistoricalTotalPower(
  feeds: readonly QdfHistoricalFeedPower[],
  expectedFeedCount: number,
  maxObservedSkewMs = 120_000,
): readonly QdfTotalPowerPoint[] {
  if (!validIdentity(feeds, expectedFeedCount)) return [];
  const byFeed = feeds.map(
    (feed) => new Map(feed.points.map((point) => [point.bucketAt, point] as const)),
  );
  const candidateBuckets = [...byFeed[0]!.keys()].filter((bucketAt) =>
    byFeed.every((series) => series.has(bucketAt)),
  );

  return candidateBuckets.flatMap((bucketAt) => {
    const points = byFeed.map((series) => series.get(bucketAt)!);
    if (
      points.some(
        (point) =>
          !finitePower(point.powerW) ||
          point.sampleCount < 1 ||
          point.pairedSampleCount !== point.sampleCount,
      )
    )
      return [];
    const observedAt = alignedObservedAt(
      points.map((point) => point.observedAt),
      maxObservedSkewMs,
    );
    if (!observedAt) return [];
    return [
      {
        bucketAt,
        observedAt,
        powerKw: points.reduce((sum, point) => sum + point.powerW!, 0) / 1000,
        contributingFeeds: points.length,
      },
    ];
  });
}

export function projectOperationalHistoricalTotalEnergy(
  feeds: readonly QdfHistoricalFeedEnergy[],
  expectedFeedCount: number,
  maxObservedSkewMs = 120_000,
  maxCoverageSkewSeconds = 0.001,
): readonly QdfTotalEnergyPoint[] {
  if (!validIdentity(feeds, expectedFeedCount)) return [];
  const byFeed = feeds.map(
    (feed) => new Map(feed.points.map((point) => [point.bucketAt, point] as const)),
  );
  const candidateBuckets = [...byFeed[0]!.keys()]
    .filter((bucketAt) => byFeed.every((series) => series.has(bucketAt)))
    .sort((left, right) => left.localeCompare(right));

  let cumulativeEnergyKwh = 0;
  const output: QdfTotalEnergyPoint[] = [];
  for (const bucketAt of candidateBuckets) {
    const points = byFeed.map((series) => series.get(bucketAt)!);
    if (
      points.some(
        (point) =>
          !finiteEnergy(point.estimatedEnergyKwh) ||
          !finiteCoverage(point.coveredSeconds) ||
          point.sampleCount < 1 ||
          point.pairedSampleCount !== point.sampleCount,
      )
    )
      continue;

    const sampleCounts = points.map((point) => point.sampleCount);
    if (Math.min(...sampleCounts) !== Math.max(...sampleCounts)) continue;
    const coverage = points.map((point) => point.coveredSeconds);
    if (Math.max(...coverage) - Math.min(...coverage) > maxCoverageSkewSeconds) continue;
    const observedAt = alignedObservedAt(
      points.map((point) => point.observedAt),
      maxObservedSkewMs,
    );
    if (!observedAt) continue;

    const intervalEnergyKwh = points.reduce((sum, point) => sum + point.estimatedEnergyKwh!, 0);
    cumulativeEnergyKwh += intervalEnergyKwh;
    output.push({
      bucketAt,
      observedAt,
      intervalEnergyKwh,
      cumulativeEnergyKwh,
      coveredSeconds: Math.min(...coverage),
      contributingFeeds: points.length,
    });
  }
  return output;
}

function historicalVoltagePoint(
  bucketAt: string,
  feeds: readonly { voltageV: number; observedAt: string }[],
): QdfVoltageHistoryPoint {
  return {
    bucketAt,
    observedAt: new Date(
      Math.max(...feeds.map((feed) => Date.parse(feed.observedAt))),
    ).toISOString(),
    voltageV: average(feeds.map((feed) => feed.voltageV)),
    contributingFeeds: feeds.length,
  };
}

export function projectOperationalHistoricalVoltage(
  feeds: readonly QdfHistoricalVoltageFeed[],
  expectedFeedCount: number,
  maxObservedSkewMs = 120_000,
): QdfHistoricalVoltageProjection {
  const empty: QdfHistoricalVoltageProjection = { busA: [], busB: [], total: [] };
  if (
    !validIdentity(
      feeds.map((feed) => ({
        accessPortId: feed.accessPortId,
        position: feed.position ?? feed.side,
      })),
      expectedFeedCount,
    ) ||
    feeds.some((feed) => !feed.side)
  )
    return empty;

  const byFeed = feeds.map(
    (feed) => new Map(feed.points.map((point) => [point.bucketAt, point] as const)),
  );
  const candidateBuckets = [...byFeed[0]!.keys()].filter((bucketAt) =>
    byFeed.every((series) => series.has(bucketAt)),
  );
  const busA: QdfVoltageHistoryPoint[] = [];
  const busB: QdfVoltageHistoryPoint[] = [];
  const total: QdfVoltageHistoryPoint[] = [];

  for (const bucketAt of candidateBuckets) {
    const points = feeds.map((feed, index) => ({
      feed,
      point: byFeed[index]!.get(bucketAt)!,
    }));
    if (points.some(({ point }) => !finiteVoltage(point.voltageV))) continue;
    const observedAt = alignedObservedAt(
      points.map(({ point }) => point.observedAt),
      maxObservedSkewMs,
    );
    if (!observedAt) continue;

    const sideA = points
      .filter(({ feed }) => feed.side === 'A')
      .map(({ point }) => ({ voltageV: point.voltageV!, observedAt: point.observedAt }));
    const sideB = points
      .filter(({ feed }) => feed.side === 'B')
      .map(({ point }) => ({ voltageV: point.voltageV!, observedAt: point.observedAt }));
    if (sideA.length) busA.push(historicalVoltagePoint(bucketAt, sideA));
    if (sideB.length) busB.push(historicalVoltagePoint(bucketAt, sideB));
    if (sideA.length && sideB.length) {
      const a = historicalVoltagePoint(bucketAt, sideA);
      const b = historicalVoltagePoint(bucketAt, sideB);
      total.push({
        bucketAt,
        observedAt,
        voltageV: average([a.voltageV, b.voltageV]),
        contributingFeeds: a.contributingFeeds + b.contributingFeeds,
      });
    }
  }

  return { busA, busB, total };
}
