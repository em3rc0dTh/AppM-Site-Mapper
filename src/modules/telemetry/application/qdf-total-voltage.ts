import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

export type QdfVoltageSide = 'A' | 'B';

export interface QdfVoltageFeedEvidence {
  readonly accessPortId: string;
  readonly side: QdfVoltageSide | null;
  readonly position: string | null;
  readonly verified: boolean;
  readonly sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly voltageV: number | null;
  readonly observedAt: string | null;
}

export interface QdfHistoricalVoltageFeed {
  readonly accessPortId: string;
  readonly side: QdfVoltageSide | null;
  readonly position: string | null;
  readonly verified: boolean;
  readonly sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly points: readonly SnmpHistoricalBucket[];
}

export interface QdfVoltageValue {
  readonly voltageV: number;
  readonly observedAt: string;
  readonly contributingFeeds: number;
}

export interface QdfVoltageSnapshot {
  readonly busA: QdfVoltageValue | null;
  readonly busB: QdfVoltageValue | null;
  readonly total: QdfVoltageValue | null;
}

export interface QdfHistoricalVoltageProjection {
  readonly busA: readonly QdfVoltageHistoryPoint[];
  readonly busB: readonly QdfVoltageHistoryPoint[];
  readonly total: readonly QdfVoltageHistoryPoint[];
}

export interface QdfVoltageHistoryPoint {
  readonly bucketAt: string;
  readonly observedAt: string;
  readonly voltageV: number;
  readonly contributingFeeds: number;
}

const finiteVoltage = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const finiteTolerance = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && value <= 20;

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coherent(values: readonly number[], toleranceV: number): boolean {
  return values.length > 0 && Math.max(...values) - Math.min(...values) <= toleranceV;
}

function sideProjection(
  feeds: readonly QdfVoltageFeedEvidence[],
  side: QdfVoltageSide,
  toleranceV: number,
): QdfVoltageValue | null {
  const selected = feeds.filter((feed) => feed.side === side);
  if (!selected.length || selected.some((feed) => !finiteVoltage(feed.voltageV))) return null;
  const values = selected.map((feed) => feed.voltageV!);
  if (!coherent(values, toleranceV)) return null;
  const observed = selected.map((feed) => Date.parse(feed.observedAt ?? ''));
  if (observed.some((value) => !Number.isFinite(value))) return null;
  return {
    voltageV: average(values),
    observedAt: new Date(Math.max(...observed)).toISOString(),
    contributingFeeds: selected.length,
  };
}

export function projectVerifiedQdfVoltage(
  feeds: readonly QdfVoltageFeedEvidence[],
  expectedFeedCount: number,
  inventoryComplete: boolean,
  toleranceV: number,
  maxSkewMs = 5_000,
): QdfVoltageSnapshot {
  const unavailable: QdfVoltageSnapshot = { busA: null, busB: null, total: null };
  if (
    !inventoryComplete ||
    expectedFeedCount < 1 ||
    feeds.length !== expectedFeedCount ||
    !finiteTolerance(toleranceV) ||
    feeds.some(
      (feed) =>
        !feed.verified ||
        feed.sourceMode !== 'FIELD' ||
        !finiteVoltage(feed.voltageV) ||
        !feed.side,
    )
  )
    return unavailable;

  const ids = feeds.map((feed) => feed.accessPortId);
  const positions = feeds.map((feed) => feed.position ?? feed.side);
  if (
    new Set(ids).size !== ids.length ||
    positions.some((position) => !position) ||
    new Set(positions).size !== positions.length
  )
    return unavailable;

  const observed = feeds.map((feed) => Date.parse(feed.observedAt ?? ''));
  if (observed.some((value) => !Number.isFinite(value))) return unavailable;
  if (Math.max(...observed) - Math.min(...observed) > maxSkewMs) return unavailable;

  const busA = sideProjection(feeds, 'A', toleranceV);
  const busB = sideProjection(feeds, 'B', toleranceV);
  if (!busA || !busB) return { busA, busB, total: null };

  const totalValues = [busA.voltageV, busB.voltageV];
  const total =
    coherent(totalValues, toleranceV)
      ? {
          voltageV: average(totalValues),
          observedAt: new Date(
            Math.max(Date.parse(busA.observedAt), Date.parse(busB.observedAt)),
          ).toISOString(),
          contributingFeeds: busA.contributingFeeds + busB.contributingFeeds,
        }
      : null;

  return { busA, busB, total };
}

export function projectHistoricalQdfVoltage(
  feeds: readonly QdfHistoricalVoltageFeed[],
  expectedFeedCount: number,
  inventoryComplete: boolean,
  toleranceV: number,
  maxObservedSkewMs = 120_000,
): QdfHistoricalVoltageProjection {
  const empty: QdfHistoricalVoltageProjection = { busA: [], busB: [], total: [] };
  if (
    !inventoryComplete ||
    expectedFeedCount < 1 ||
    feeds.length !== expectedFeedCount ||
    !finiteTolerance(toleranceV) ||
    feeds.some((feed) => !feed.verified || feed.sourceMode !== 'FIELD' || !feed.side)
  )
    return empty;

  const ids = feeds.map((feed) => feed.accessPortId);
  const positions = feeds.map((feed) => feed.position ?? feed.side);
  if (
    new Set(ids).size !== ids.length ||
    positions.some((position) => !position) ||
    new Set(positions).size !== positions.length
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
    const points = feeds.map((feed, index) => ({ feed, point: byFeed[index]!.get(bucketAt)! }));
    const observed = points.map(({ point }) => Date.parse(point.observedAt));
    if (observed.some((value) => !Number.isFinite(value))) continue;
    if (Math.max(...observed) - Math.min(...observed) > maxObservedSkewMs) continue;

    const snapshot = projectVerifiedQdfVoltage(
      points.map(({ feed, point }) => ({
        accessPortId: feed.accessPortId,
        side: feed.side,
        position: feed.position,
        verified: feed.verified,
        sourceMode: feed.sourceMode,
        voltageV: point.voltageV,
        observedAt: point.observedAt,
      })),
      expectedFeedCount,
      true,
      toleranceV,
      maxObservedSkewMs,
    );

    if (snapshot.busA)
      busA.push({
        bucketAt,
        observedAt: snapshot.busA.observedAt,
        voltageV: snapshot.busA.voltageV,
        contributingFeeds: snapshot.busA.contributingFeeds,
      });
    if (snapshot.busB)
      busB.push({
        bucketAt,
        observedAt: snapshot.busB.observedAt,
        voltageV: snapshot.busB.voltageV,
        contributingFeeds: snapshot.busB.contributingFeeds,
      });
    if (snapshot.total)
      total.push({
        bucketAt,
        observedAt: snapshot.total.observedAt,
        voltageV: snapshot.total.voltageV,
        contributingFeeds: snapshot.total.contributingFeeds,
      });
  }

  return { busA, busB, total };
}
