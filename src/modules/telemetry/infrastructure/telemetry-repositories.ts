import type { TelemetryAcceptanceRepository } from '@/modules/telemetry/application/telemetry-acceptance-repository';
import type { TelemetryLatestRepository } from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetryQuarantineRepository } from '@/modules/telemetry/application/telemetry-quarantine-repository';
import type { TelemetrySourceRepository } from '@/modules/telemetry/application/telemetry-source-repository';
import { MemoryTelemetryAcceptanceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-acceptance-repository';
import { MemoryTelemetryLatestRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-latest-repository';
import { MemoryTelemetryQuarantineRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-quarantine-repository';
import { MemoryTelemetrySourceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-source-repository';
import { MongoTelemetryAcceptanceRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-acceptance-repository';
import { MongoTelemetryLatestRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-latest-repository';
import { MongoTelemetryQuarantineRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-quarantine-repository';
import { ensureTelemetryMongoIndexes } from '@/modules/telemetry/infrastructure/mongo-telemetry-indexes';
import { MongoTelemetrySourceRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-source-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface TelemetryRepositories {
  readonly sources: TelemetrySourceRepository;
  readonly latest: TelemetryLatestRepository;
  readonly acceptance: TelemetryAcceptanceRepository;
  readonly quarantine: TelemetryQuarantineRepository;
}

let mongoRepositories: Promise<TelemetryRepositories> | undefined;

export async function createTelemetryRepositories(): Promise<TelemetryRepositories> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<TelemetryRepositories>('telemetry-memory-repositories', () => ({
      sources: new MemoryTelemetrySourceRepository(),
      latest: new MemoryTelemetryLatestRepository(),
      acceptance: new MemoryTelemetryAcceptanceRepository(),
      quarantine: new MemoryTelemetryQuarantineRepository(),
    }));
  }

  mongoRepositories ??= getMongoDatabase().then(async (database) => {
    await ensureTelemetryMongoIndexes(database);

    return {
      sources: new MongoTelemetrySourceRepository(database),
      latest: new MongoTelemetryLatestRepository(database),
      acceptance: new MongoTelemetryAcceptanceRepository(database),
      quarantine: new MongoTelemetryQuarantineRepository(database),
    };
  });

  return mongoRepositories;
}
