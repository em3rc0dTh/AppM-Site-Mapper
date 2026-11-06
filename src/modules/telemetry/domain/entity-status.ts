import type { TelemetrySample } from './entities';
import { classifyTelemetryFreshness } from './telemetry-freshness';

export function entityTelemetryStatus(
  mapped: boolean,
  sample: TelemetrySample | null,
  now = Date.now(),
) {
  if (!mapped) return 'UNMAPPED';
  if (!sample || !Object.keys(sample.reported).length) return 'NO DATA';

  const observed = Object.values(sample.reported).flatMap((value) =>
    value &&
    typeof value === 'object' &&
    'observedAt' in value &&
    typeof value.observedAt === 'string'
      ? [value.observedAt]
      : [],
  );
  const sourceObservedAt = observed.sort().at(-1) ?? sample.sourceObservedAt;

  return classifyTelemetryFreshness(sample.receivedAt, sourceObservedAt, now);
}
