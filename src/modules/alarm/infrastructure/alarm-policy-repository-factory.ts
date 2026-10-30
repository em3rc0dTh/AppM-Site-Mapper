import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MongoAlarmPolicyRepository } from '@/modules/alarm/infrastructure/mongo-alarm-policy-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export async function createAlarmPolicyRepository(): Promise<AlarmPolicyRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<AlarmPolicyRepository>(
      'alarm-policy-memory-repository',
      () => new MemoryAlarmPolicyRepository(),
    );
  }
  return new MongoAlarmPolicyRepository(await getMongoDatabase());
}
