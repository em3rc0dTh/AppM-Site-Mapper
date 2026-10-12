import type { TelemetrySample, BreakerTelemetryReading } from './entities';

/** Explicit BDFB breaker projection. Own Equipment metrics are never promoted to the parent. */
export function bdfbSourceView(
  samples: readonly TelemetrySample[],
  deviceId: string,
  now?: number,
): TelemetrySample | null {
  const eligible = samples.filter(
    (sample) =>
      sample.targetId === deviceId ||
      sample.breakerReadings?.some((reading) => reading.deviceId === deviceId),
  );
  if (!eligible.length) return null;
  const byBreaker = new Map<string, BreakerTelemetryReading[]>();
  for (const sample of eligible)
    for (const reading of sample.breakerReadings ?? []) {
      if (reading.deviceId !== deviceId || reading.sourceIdentity !== sample.sourceIdentity)
        continue;
      byBreaker.set(reading.breakerId, [...(byBreaker.get(reading.breakerId) ?? []), reading]);
    }
  // Conflicting sources do not double-count a breaker or silently win by arrival order.
  const readings = [...byBreaker.values()].flatMap((group) => {
    if (group.length !== 1) return [];
    const reading = group[0]!;
    if (now === undefined) return [reading];
    const metrics = Object.fromEntries(
      Object.entries(reading.metrics).filter(([, metric]) => {
        const age = now - Date.parse(metric.observedAt);
        return age >= -30_000 && age <= 30_000;
      }),
    );
    return Object.keys(metrics).length ? [{ ...reading, metrics }] : [];
  });
  const latest = eligible.reduce((a, b) => (a.receivedAt > b.receivedAt ? a : b));
  return { ...latest, reported: {}, breakerReadings: readings };
}
