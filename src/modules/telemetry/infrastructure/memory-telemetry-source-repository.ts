import type { TelemetrySourceRepository } from '@/modules/telemetry/application/telemetry-source-repository';
import type { TelemetrySource } from '@/modules/telemetry/domain/entities';

export class MemoryTelemetrySourceRepository implements TelemetrySourceRepository {
  private readonly sources = new Map<string, TelemetrySource>();

  constructor(seed: readonly TelemetrySource[] = []) {
    for (const source of seed) {
      this.assertUnique(source);
      this.sources.set(source.topicSource, structuredClone(source));
    }
  }

  async findByTopicSource(topicSource: string): Promise<TelemetrySource | null> {
    const source = this.sources.get(topicSource);
    return source ? structuredClone(source) : null;
  }

  async list(): Promise<readonly TelemetrySource[]> {
    return [...this.sources.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((source) => structuredClone(source));
  }

  async insert(source: TelemetrySource): Promise<void> {
    this.assertUnique(source);
    this.sources.set(source.topicSource, structuredClone(source));
  }

  private assertUnique(source: TelemetrySource): void {
    if (
      [...this.sources.values()].some(
        (candidate) => candidate.id === source.id || candidate.topicSource === source.topicSource,
      )
    ) {
      throw new Error('Telemetry source id/topicSource must be unique.');
    }
  }
}
