import type { PowerTargetCatalogRepository } from '@/modules/power/application/power-target-catalog-repository';
import { MemoryPowerTargetCatalogRepository } from '@/modules/power/infrastructure/memory-power-target-catalog-repository';
import { MongoPowerTargetCatalogRepository } from '@/modules/power/infrastructure/mongo-power-target-catalog-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export async function createPowerTargetCatalogRepository(): Promise<PowerTargetCatalogRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<PowerTargetCatalogRepository>(
      'power-target-catalog-memory-repository',
      () => new MemoryPowerTargetCatalogRepository(),
    );
  }

  return new MongoPowerTargetCatalogRepository(await getMongoDatabase());
}
