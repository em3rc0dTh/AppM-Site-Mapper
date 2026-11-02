import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

export interface QdfHistoricalFeedEnergy {
  readonly accessPortId: string;
  readonly position: string | null;
  readonly verified: boolean;
  readonly sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  readonly points: readonly SnmpHistoricalBucket[];
}

export interface QdfTotalEnergyPoint {
  readonly bucketAt: string;
  readonly observedAt: string;
  readonly intervalEnergyKwh: number;
  readonly cumulativeEnergyKwh: number;
  readonly coveredSeconds: number;
  readonly contributingFeeds: number;
}

const finiteEnergy = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const finiteCoverage = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function projectHistoricalQdfTotalEnergy(
  feeds: readonly QdfHistoricalFeedEnergy[],
  expectedFeedCount: number,
  inventoryComplete: boolean,
  maxObservedSkewMs = 120_000,
  maxCoverageSkewSeconds = 0.001,
): readonly QdfTotalEnergyPoint[] {
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

    const observed = points.map((point) => Date.parse(point.observedAt));
    if (observed.some((value) => !Number.isFinite(value))) continue;
    if (Math.max(...observed) - Math.min(...observed) > maxObservedSkewMs) continue;

    const intervalEnergyKwh = points.reduce((sum, point) => sum + point.estimatedEnergyKwh!, 0);
    cumulativeEnergyKwh += intervalEnergyKwh;
    output.push({
      bucketAt,
      observedAt: new Date(Math.max(...observed)).toISOString(),
      intervalEnergyKwh,
      cumulativeEnergyKwh,
      coveredSeconds: Math.min(...coverage),
      contributingFeeds: points.length,
    });
  }

  return output;
}
