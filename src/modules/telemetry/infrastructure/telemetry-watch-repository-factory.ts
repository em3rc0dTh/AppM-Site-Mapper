import type { TelemetryWatchRepository } from '@/modules/telemetry/application/telemetry-watch-repository';
import { MemoryTelemetryWatchRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-watch-repository';
import { MongoTelemetryWatchRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-watch-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export async function createTelemetryWatchRepository(): Promise<TelemetryWatchRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<TelemetryWatchRepository>(
      'telemetry-watch-memory-repository',
      () => new MemoryTelemetryWatchRepository(),
    );
  }
  return getProcessSingleton<Promise<TelemetryWatchRepository>>(
    'telemetry-watch-mongo-repository',
    async () => new MongoTelemetryWatchRepository(await getMongoDatabase()),
  );
}
