import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

export interface QdfHistoricalFeedPower {
  readonly accessPortId: string;
  readonly position: string | null;
  readonly verified: boolean;
  readonly sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly points: readonly SnmpHistoricalBucket[];
}

export interface QdfLiveFeedPowerEvidence {
  readonly accessPortId: string;
  readonly sameSource: boolean;
  readonly currentSourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly voltageSourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly currentObservedAt: string | null;
  readonly voltageObservedAt: string | null;
}

export interface QdfTotalPowerPoint {
  readonly bucketAt: string;
  readonly observedAt: string;
  readonly powerKw: number;
  readonly contributingFeeds: number;
}

export interface QdfLiveTotalPower {
  readonly powerKw: number;
  readonly observedAt: string;
  readonly contributingFeeds: number;
}

const finitePower = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function projectVerifiedLiveTotalPower(
  load: SnmpBdfbLoadView,
  evidence: readonly QdfLiveFeedPowerEvidence[],
  maxSkewMs = 5_000,
): QdfLiveTotalPower | null {
  if (
    load.status !== 'COMPLETE' ||
    load.inventoryStatus !== 'COMPLETE' ||
    !finitePower(load.totalEstimatedPowerW) ||
    load.expectedFeedCount < 1 ||
    load.feeds.length !== load.expectedFeedCount ||
    evidence.length !== load.expectedFeedCount ||
    load.feeds.some((feed) => feed.status !== 'LIVE' || !finitePower(feed.estimatedPowerW))
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

  const evidenceById = new Map(evidence.map((item) => [item.accessPortId, item] as const));
  const observed: number[] = [];
  for (const feed of load.feeds) {
    const item = evidenceById.get(feed.accessPortId);
    if (
      !item ||
      !item.sameSource ||
      item.currentSourceMode !== 'FIELD' ||
      item.voltageSourceMode !== 'FIELD'
    )
      return null;
    const currentAt = Date.parse(item.currentObservedAt ?? '');
    const voltageAt = Date.parse(item.voltageObservedAt ?? '');
    if (!Number.isFinite(currentAt) || !Number.isFinite(voltageAt)) return null;
    if (Math.abs(currentAt - voltageAt) > maxSkewMs) return null;
    observed.push(Math.max(currentAt, voltageAt));
  }

  if (Math.max(...observed) - Math.min(...observed) > maxSkewMs) return null;

  return {
    powerKw: load.totalEstimatedPowerW / 1000,
    observedAt: new Date(Math.max(...observed)).toISOString(),
    contributingFeeds: load.feeds.length,
  };
}

export function projectHistoricalQdfTotalPower(
  feeds: readonly QdfHistoricalFeedPower[],
  expectedFeedCount: number,
  inventoryComplete: boolean,
  maxObservedSkewMs = 120_000,
): readonly QdfTotalPowerPoint[] {
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
    if (points.some((point) => !finitePower(point.powerW))) return [];

    const observed = points.map((point) => Date.parse(point.observedAt));
    if (observed.some((value) => !Number.isFinite(value))) return [];
    if (Math.max(...observed) - Math.min(...observed) > maxObservedSkewMs) return [];

    return [
      {
        bucketAt,
        observedAt: new Date(Math.max(...observed)).toISOString(),
        powerKw: points.reduce((sum, point) => sum + point.powerW!, 0) / 1000,
        contributingFeeds: points.length,
      },
    ];
  });
}
