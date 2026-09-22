import type {
  AuthThrottle,
  IdentityRepository,
} from '@/modules/identity/application/identity-repository';
import {
  MemoryAuthThrottle,
  MemoryIdentityRepository,
} from '@/modules/identity/infrastructure/memory-identity-repository';
import {
  MongoAuthThrottle,
  MongoIdentityRepository,
} from '@/modules/identity/infrastructure/mongo-identity-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';

export interface IdentityRuntime {
  readonly repository: IdentityRepository;
  readonly throttle: AuthThrottle;
}

const memoryRuntime: IdentityRuntime = {
  repository: new MemoryIdentityRepository(),
  throttle: new MemoryAuthThrottle(),
};

let mongoRuntime: Promise<IdentityRuntime> | undefined;

export async function getIdentityRuntime(): Promise<IdentityRuntime> {
  if (getPersistenceMode() === 'memory') {
    return memoryRuntime;
  }

  mongoRuntime ??= getMongoDatabase().then((database) => ({
    repository: new MongoIdentityRepository(database),
    throttle: new MongoAuthThrottle(database),
  }));

  return mongoRuntime;
}
