import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export interface TelemetryLatestRepository {
  getByEntityId(entityId: string): Promise<TelemetrySample | null>;
  list(): Promise<readonly TelemetrySample[]>;
  upsertIfNewer(sample: TelemetrySample): Promise<boolean>;
}

export function compareTelemetryRecency(left: TelemetrySample, right: TelemetrySample): number {
  const observed = left.observedAt.localeCompare(right.observedAt);
  if (observed !== 0) return observed;
  return left.receivedAt.localeCompare(right.receivedAt);
}
