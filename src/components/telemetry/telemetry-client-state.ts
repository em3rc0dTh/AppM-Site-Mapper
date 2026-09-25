import { compareTelemetryRecency } from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export function upsertTelemetrySample(
  samples: readonly TelemetrySample[],
  sample: TelemetrySample,
): TelemetrySample[] {
  const next = samples.filter((item) => item.entityId !== sample.entityId);
  next.push(sample);
  return next.sort((left, right) => left.entityId.localeCompare(right.entityId));
}

export function dedupeTelemetrySamples(samples: readonly TelemetrySample[]): TelemetrySample[] {
  const latestByEntity = new Map<string, TelemetrySample>();

  for (const sample of samples) {
    const current = latestByEntity.get(sample.entityId);
    if (!current || compareTelemetryRecency(sample, current) >= 0) {
      latestByEntity.set(sample.entityId, sample);
    }
  }

  return [...latestByEntity.values()].sort((left, right) =>
    left.entityId.localeCompare(right.entityId),
  );
}
