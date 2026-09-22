import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { MongoTopologyRepository } from '@/modules/topology/infrastructure/mongo-topology-repository';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';

export type PersistenceMode = 'memory' | 'mongodb';

export function getPersistenceMode(): PersistenceMode {
  const configured = process.env.APP_PERSISTENCE?.trim();

  if (!configured) {
    return process.env.APP_ENV === 'production' ? 'mongodb' : 'memory';
  }

  if (configured !== 'memory' && configured !== 'mongodb') {
    throw new Error('APP_PERSISTENCE must be either memory or mongodb.');
  }

  if (configured === 'memory' && process.env.APP_ENV === 'production') {
    throw new Error('APP_PERSISTENCE=memory is prohibited in production.');
  }

  return configured;
}

export async function createTopologyRepository(): Promise<TopologyRepository> {
  if (getPersistenceMode() === 'memory') {
    return new MemoryTopologyRepository();
  }

  return new MongoTopologyRepository(await getMongoDatabase());
}
