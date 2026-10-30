import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import { MongoAlarmRepository } from '@/modules/alarm/infrastructure/mongo-alarm-repository';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export async function createAlarmRepository(): Promise<AlarmRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<AlarmRepository>(
      'alarm-memory-repository',
      () => new MemoryAlarmRepository(),
    );
  }
  return new MongoAlarmRepository(await getMongoDatabase());
}
