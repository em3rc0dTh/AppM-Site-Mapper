import type { PowerRepository } from '@/modules/power/application/power-repository';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { MongoPowerRepository } from '@/modules/power/infrastructure/mongo-power-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';

const memoryRepository = new MemoryPowerRepository();

export async function createPowerRepository(): Promise<PowerRepository> {
  if (getPersistenceMode() === 'memory') {
    return memoryRepository;
  }

  return new MongoPowerRepository(await getMongoDatabase());
}
