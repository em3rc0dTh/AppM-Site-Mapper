import type { TelemetrySample } from './entities';

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
  const age =
    now - Date.parse(observed.sort().at(-1) ?? sample.sourceObservedAt ?? sample.receivedAt);
  if (!Number.isFinite(age) || age > 300_000 || age < -30_000) return 'OFFLINE';
  return age > 30_000 ? 'STALE' : 'LIVE';
}
