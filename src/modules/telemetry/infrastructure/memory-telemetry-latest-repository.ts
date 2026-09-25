import {
  compareTelemetryRecency,
  mergeTelemetrySnapshot,
  type TelemetryLatestRepository,
} from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export class MemoryTelemetryLatestRepository implements TelemetryLatestRepository {
  private readonly latestByEntity = new Map<string, TelemetrySample>();

  async getByEntityId(entityId: string): Promise<TelemetrySample | null> {
    const sample = this.latestByEntity.get(entityId);
    return sample ? structuredClone(sample) : null;
  }

  async list(): Promise<readonly TelemetrySample[]> {
    return [...this.latestByEntity.values()]
      .sort((left, right) => left.entityId.localeCompare(right.entityId))
      .map((sample) => structuredClone(sample));
  }

  async upsertIfNewer(sample: TelemetrySample): Promise<boolean> {
    const current = this.latestByEntity.get(sample.entityId);

    if (current && compareTelemetryRecency(sample, current) < 0) {
      return false;
    }

    this.latestByEntity.set(
      sample.entityId,
      structuredClone(mergeTelemetrySnapshot(current ?? null, sample)),
    );
    return true;
  }
}
