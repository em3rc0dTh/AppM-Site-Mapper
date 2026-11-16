import { persistenceMode } from '@/config/env';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { MongoTopologyRepository } from '@/modules/topology/infrastructure/mongo-topology-repository';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export type PersistenceMode = 'memory' | 'mongodb';

let mongoRepository: Promise<TopologyRepository> | undefined;

export const getPersistenceMode = persistenceMode;

export async function createTopologyRepository(): Promise<TopologyRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<TopologyRepository>(
      'topology-memory-repository',
      () => new MemoryTopologyRepository(),
    );
  }

  mongoRepository ??= getMongoDatabase().then((database) => new MongoTopologyRepository(database));

  return mongoRepository;
}
