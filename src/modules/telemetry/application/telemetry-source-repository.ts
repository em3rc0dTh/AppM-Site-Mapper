import type { TelemetrySource } from '@/modules/telemetry/domain/entities';

export interface TelemetrySourceRepository {
  findByTopicSource(topicSource: string): Promise<TelemetrySource | null>;
  list(): Promise<readonly TelemetrySource[]>;
  insert(source: TelemetrySource): Promise<void>;
}
