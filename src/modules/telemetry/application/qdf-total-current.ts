import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

export interface QdfHistoricalFeedCurrent {
  readonly accessPortId: string;
  readonly position: string | null;
  readonly verified: boolean;
  readonly sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly points: readonly SnmpHistoricalBucket[];
}

export interface QdfTotalCurrentPoint {
  readonly bucketAt: string;
  readonly observedAt: string;
  readonly currentA: number;
  readonly contributingFeeds: number;
}

export interface QdfLiveTotalCurrent {
  readonly currentA: number;
  readonly observedAt: string;
  readonly contributingFeeds: number;
}

const finiteCurrent = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function projectVerifiedLiveTotalCurrent(
  load: SnmpBdfbLoadView,
  maxSkewMs = 5_000,
): QdfLiveTotalCurrent | null {
  if (
    load.status !== 'COMPLETE' ||
    load.inventoryStatus !== 'COMPLETE' ||
    !finiteCurrent(load.totalCurrentA) ||
    load.expectedFeedCount < 1 ||
    load.feeds.length !== load.expectedFeedCount ||
    load.feeds.some((feed) => feed.status !== 'LIVE' || !finiteCurrent(feed.currentA))
  )
    return null;

  const ids = load.feeds.map((feed) => feed.accessPortId);
  const positions = load.feeds.map((feed) => feed.feedPosition ?? feed.side);
  if (
    new Set(ids).size !== ids.length ||
    positions.some((position) => !position) ||
    new Set(positions).size !== positions.length
  )
    return null;

  const observed = load.feeds.map((feed) => Date.parse(feed.observedAt ?? ''));
  if (observed.some((value) => !Number.isFinite(value))) return null;
  const earliest = Math.min(...observed);
  const latest = Math.max(...observed);
  if (latest - earliest > maxSkewMs) return null;

  return {
    currentA: load.totalCurrentA,
    observedAt: new Date(latest).toISOString(),
    contributingFeeds: load.feeds.length,
  };
}

export function projectHistoricalQdfTotalCurrent(
  feeds: readonly QdfHistoricalFeedCurrent[],
  expectedFeedCount: number,
  inventoryComplete: boolean,
  maxObservedSkewMs = 120_000,
): readonly QdfTotalCurrentPoint[] {
  if (
    !inventoryComplete ||
    expectedFeedCount < 1 ||
    feeds.length !== expectedFeedCount ||
    feeds.some((feed) => feed.sourceMode !== 'FIELD' || !feed.verified)
  )
    return [];

  const ids = feeds.map((feed) => feed.accessPortId);
  const positions = feeds.map((feed) => feed.position);
  if (
    new Set(ids).size !== ids.length ||
    positions.some((position) => !position) ||
    new Set(positions).size !== positions.length
  )
    return [];

  const byFeed = feeds.map(
    (feed) => new Map(feed.points.map((point) => [point.bucketAt, point] as const)),
  );
  const candidateBuckets = [...byFeed[0]!.keys()].filter((bucketAt) =>
    byFeed.every((series) => series.has(bucketAt)),
  );

  return candidateBuckets.flatMap((bucketAt) => {
    const points = byFeed.map((series) => series.get(bucketAt)!);
    if (points.some((point) => !finiteCurrent(point.currentA))) return [];

    const observed = points.map((point) => Date.parse(point.observedAt));
    if (observed.some((value) => !Number.isFinite(value))) return [];
    if (Math.max(...observed) - Math.min(...observed) > maxObservedSkewMs) return [];

    return [
      {
        bucketAt,
        observedAt: new Date(Math.max(...observed)).toISOString(),
        currentA: points.reduce((sum, point) => sum + point.currentA!, 0),
        contributingFeeds: points.length,
      },
    ];
  });
}
