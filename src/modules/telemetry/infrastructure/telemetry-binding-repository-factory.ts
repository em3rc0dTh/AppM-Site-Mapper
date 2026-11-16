import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MongoTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-binding-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export async function createTelemetryBindingRepository(): Promise<TelemetryBindingRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<TelemetryBindingRepository>(
      'telemetry-binding-memory-repository',
      () => new MemoryTelemetryBindingRepository(),
    );
  }

  return new MongoTelemetryBindingRepository(await getMongoDatabase());
}
