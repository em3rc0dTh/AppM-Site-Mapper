import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import { EffectiveAlarmPolicyRepository } from '@/modules/alarm/application/effective-alarm-policy-repository';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MongoAlarmPolicyRepository } from '@/modules/alarm/infrastructure/mongo-alarm-policy-repository';
import { createRuleManagerStore } from '@/modules/alarm/infrastructure/rule-manager-store';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export async function createLegacyAlarmPolicyRepository(): Promise<AlarmPolicyRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<AlarmPolicyRepository>(
      'alarm-policy-memory-repository',
      () => new MemoryAlarmPolicyRepository(),
    );
  }
  return new MongoAlarmPolicyRepository(await getMongoDatabase());
}

export async function createAlarmPolicyRepository(): Promise<AlarmPolicyRepository> {
  return new EffectiveAlarmPolicyRepository(
    await createLegacyAlarmPolicyRepository(),
    await createRuleManagerStore(),
    await createTopologyRepository(),
    await createTelemetryBindingRepository(),
  );
}
