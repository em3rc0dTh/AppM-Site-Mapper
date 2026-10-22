import type { SnmpBdfbFeedView, SnmpBdfbLoadView } from './snmp-feed-service';

/** UI-only calculation. Never promotes synthetic values into physically certified SNMP totals. */
export interface SnmpFeedUtilization {
  readonly accessPortId: string;
  readonly label: string;
  readonly status: SnmpBdfbFeedView['status'];
  readonly measuredA: number | null;
  readonly ratedA: number | null;
  readonly availableA: number | null;
  readonly utilizationPct: number | null;
  readonly overloadedByA: number | null;
}

export interface SnmpCapacityProjection {
  readonly mode: 'LAB_SIMULATED' | 'VERIFIED_LIVE' | 'MIXED' | 'NO_LIVE_DATA';
  readonly expectedFeeds: number;
  readonly reportingFeeds: number;
  readonly feedUtilization: readonly SnmpFeedUtilization[];
  /** Full-scope figure only; null means insufficient evidence or rating. */
  readonly measuredA: number | null;
  readonly ratedA: number | null;
  readonly availableA: number | null;
  readonly utilizationPct: number | null;
  readonly overloadedByA: number | null;
}

const validCurrent = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validRating = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function projectSnmpFeedCapacity(feed: SnmpBdfbFeedView): SnmpFeedUtilization {
  const live = feed.status === 'LIVE' || feed.status === 'LAB_LIVE';
  const measuredA = live && validCurrent(feed.currentA) ? feed.currentA : null;
  const ratedA = validRating(feed.ratedCurrentA) ? feed.ratedCurrentA : null;
  const hasRatio = measuredA !== null && ratedA !== null;
  const difference = hasRatio ? ratedA - measuredA : null;
  return {
    accessPortId: feed.accessPortId,
    label: feed.feedPosition ?? feed.side ?? feed.label,
    status: feed.status,
    measuredA,
    ratedA,
    availableA: difference === null ? null : Math.max(0, difference),
    utilizationPct: hasRatio ? (measuredA / ratedA) * 100 : null,
    overloadedByA: difference === null ? null : Math.max(0, -difference),
  };
}

/**
 * Only a complete set of fresh, individually inventoried shunts of ONE evidence class
 * can yield a whole-BDFB utilization (LAB or certified LIVE, never combined).
 * Missing nominal ratings, missing feeds, duplicate identities and STALE readings
 * fail closed. The rated values come solely from persisted AccessPort metadata.
 */
export function projectSnmpCapacity(
  load: SnmpBdfbLoadView,
  selectedFeeds: readonly SnmpBdfbFeedView[] = load.feeds,
  expectedFeeds = load.expectedFeedCount,
): SnmpCapacityProjection {
  const projected = selectedFeeds.map(projectSnmpFeedCapacity);
  const reporting = projected.filter((f) => f.measuredA !== null);
  const lab = reporting.filter((f) => f.status === 'LAB_LIVE').length;
  const verified = reporting.filter((f) => f.status === 'LIVE').length;
  const mode = lab && verified ? 'MIXED' : lab ? 'LAB_SIMULATED' : verified ? 'VERIFIED_LIVE' : 'NO_LIVE_DATA';
  const identities = selectedFeeds.map((f) => f.accessPortId);
  const positions = selectedFeeds.map((f) => f.feedPosition ?? f.side);
  const uniqueIdentities = new Set(identities).size === identities.length;
  const hasUnambiguousPositions =
    positions.every((p): p is string => typeof p === 'string' && p.length > 0) &&
    new Set(positions).size === positions.length;
  const allMeasured =
    expectedFeeds > 0 &&
    selectedFeeds.length === expectedFeeds &&
    reporting.length === expectedFeeds &&
    uniqueIdentities &&
    hasUnambiguousPositions &&
    mode !== 'MIXED' &&
    mode !== 'NO_LIVE_DATA' &&
    selectedFeeds.every((f) => f.status === 'LIVE' || f.status === 'LAB_LIVE');
  // Certified capacity already depends on complete verified inventory on the server;
  // synthetic laboratory capacity is a calculation, never a certification.
  const sufficient = allMeasured && (mode === 'LAB_SIMULATED' || load.status === 'COMPLETE');
  const measuredA = sufficient ? reporting.reduce((sum, f) => sum + f.measuredA!, 0) : null;
  const ratingsComplete = sufficient && projected.every((f) => f.ratedA !== null);
  const ratedA = ratingsComplete ? projected.reduce((sum, f) => sum + f.ratedA!, 0) : null;
  const difference = measuredA !== null && ratedA !== null ? ratedA - measuredA : null;
  return {
    mode,
    expectedFeeds,
    reportingFeeds: reporting.length,
    feedUtilization: projected,
    measuredA,
    ratedA,
    availableA: difference === null ? null : Math.max(0, difference),
    utilizationPct: difference === null ? null : (measuredA! / ratedA!) * 100,
    overloadedByA: difference === null ? null : Math.max(0, -difference),
  };
}
