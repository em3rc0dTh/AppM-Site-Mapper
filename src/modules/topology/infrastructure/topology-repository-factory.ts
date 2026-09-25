import { parseAppEnvironment } from '@/config/env';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { MongoTopologyRepository } from '@/modules/topology/infrastructure/mongo-topology-repository';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export type PersistenceMode = 'memory' | 'mongodb';

let mongoRepository: Promise<TopologyRepository> | undefined;

export function getPersistenceMode(): PersistenceMode {
  const appEnvironment = parseAppEnvironment(process.env.APP_ENV);
  const configured = process.env.APP_PERSISTENCE?.trim();

  if (!configured) {
    return appEnvironment === 'production' ? 'mongodb' : 'memory';
  }

  if (configured !== 'memory' && configured !== 'mongodb') {
    throw new Error('APP_PERSISTENCE must be either memory or mongodb.');
  }

  if (configured === 'memory' && appEnvironment === 'production') {
    throw new Error('APP_PERSISTENCE=memory is prohibited in production.');
  }

  return configured;
}

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
