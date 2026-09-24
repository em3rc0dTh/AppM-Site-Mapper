import type { TelemetryLatestRepository } from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetrySourceRepository } from '@/modules/telemetry/application/telemetry-source-repository';
import { MemoryTelemetryLatestRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-latest-repository';
import { MemoryTelemetrySourceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-source-repository';
import { MongoTelemetryLatestRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-latest-repository';
import { MongoTelemetrySourceRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-source-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface TelemetryRepositories {
  readonly sources: TelemetrySourceRepository;
  readonly latest: TelemetryLatestRepository;
}

let mongoRepositories: Promise<TelemetryRepositories> | undefined;

export async function createTelemetryRepositories(): Promise<TelemetryRepositories> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<TelemetryRepositories>('telemetry-memory-repositories', () => ({
      sources: new MemoryTelemetrySourceRepository(),
      latest: new MemoryTelemetryLatestRepository(),
    }));
  }

  mongoRepositories ??= getMongoDatabase().then((database) => ({
    sources: new MongoTelemetrySourceRepository(database),
    latest: new MongoTelemetryLatestRepository(database),
  }));

  return mongoRepositories;
}
