import type { SnmpControllerProfile } from '../domain/snmp-controller-profile';
import {
  presentControllerReading,
  type SnmpControllerObservation,
} from './snmp-controller-presentation';
import type { SnmpBdfbLoadView } from './snmp-feed-service';

/** Configured nameplate capacity, independent of telemetry or shunt certification. */
export function configuredControllerCapacity(load: SnmpBdfbLoadView | null): number | null {
  if (
    !load ||
    load.expectedFeedCount <= 0 ||
    load.feeds.length !== load.expectedFeedCount ||
    load.feedCount !== load.expectedFeedCount ||
    load.missingFeedPositions.length ||
    load.configurationIssues.some((issue) => !/^SHUNT_NOT_VERIFIED_/.test(issue))
  )
    return null;
  const ids = load.feeds.map((feed) => feed.accessPortId);
  const positions = load.feeds.map((feed) => feed.feedPosition ?? feed.side);
  if (
    new Set(ids).size !== ids.length ||
    positions.some((p) => !p) ||
    new Set(positions).size !== positions.length ||
    load.feeds.some(
      (feed) =>
        typeof feed.ratedCurrentA !== 'number' ||
        !Number.isFinite(feed.ratedCurrentA) ||
        feed.ratedCurrentA <= 0,
    )
  )
    return null;
  const sum = load.feeds.reduce((total, feed) => total + feed.ratedCurrentA!, 0);
  return Number.isFinite(sum) ? sum : null;
}

/** Display-only general telemetry; never creates or substitutes AccessPort measurements. */
export function controllerSummary(
  profile: SnmpControllerProfile,
  signals: readonly SnmpControllerObservation[],
  now: number,
) {
  const reading = (metric: 'CURRENT' | 'VOLTAGE') => {
    const specs = profile.signals.filter(
      (spec) => spec.metric === metric && spec.displayMode === 'NORMALIZED',
    );
    if (specs.length !== 1) return null;
    const spec = specs[0]!;
    const matches = signals.filter(
      (s) =>
        s.key === spec.oid && s.sourceIdentity === profile.sourceIdentity && s.protocol === 'SNMP',
    );
    return matches.length === 1 ? presentControllerReading(matches[0], spec, now) : null;
  };
  const current = reading('CURRENT');
  const voltage = reading('VOLTAGE');
  const currentA = current?.numericValue ?? null;
  const voltageV = voltage?.numericValue ?? null;
  // One polling round's readings must align. No cross-round cached power estimate.
  const coherent =
    current?.receivedAt &&
    voltage?.receivedAt &&
    Math.abs(Date.parse(current.receivedAt) - Date.parse(voltage.receivedAt)) <= 5_000;
  const estimate =
    currentA !== null && voltageV !== null && coherent ? (currentA * voltageV) / 1000 : null;
  return {
    currentA,
    voltageV,
    estimatedPowerKw: estimate !== null && Number.isFinite(estimate) ? estimate : null,
  };
}
