import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export function upsertTelemetrySample(
  samples: readonly TelemetrySample[],
  sample: TelemetrySample,
): TelemetrySample[] {
  const next = samples.filter((item) => item.entityId !== sample.entityId);
  next.push(sample);
  return next.sort((left, right) => left.entityId.localeCompare(right.entityId));
}

export function dedupeTelemetrySamples(
  samples: readonly TelemetrySample[],
): TelemetrySample[] {
  return samples.reduce<TelemetrySample[]>(
    (current, sample) => upsertTelemetrySample(current, sample),
    [],
  );
}
