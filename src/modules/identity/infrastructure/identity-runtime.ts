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
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface IdentityRuntime {
  readonly repository: IdentityRepository;
  readonly throttle: AuthThrottle;
}

let mongoRuntime: Promise<IdentityRuntime> | undefined;

function getMemoryRuntime(): IdentityRuntime {
  return getProcessSingleton<IdentityRuntime>('identity-memory-runtime', () => ({
    repository: new MemoryIdentityRepository(),
    throttle: new MemoryAuthThrottle(),
  }));
}

export async function getIdentityRuntime(): Promise<IdentityRuntime> {
  if (getPersistenceMode() === 'memory') {
    return getMemoryRuntime();
  }

  mongoRuntime ??= getMongoDatabase().then((database) => ({
    repository: new MongoIdentityRepository(database),
    throttle: new MongoAuthThrottle(database),
  }));

  return mongoRuntime;
}
