import type { AlarmPolicy } from '@/modules/alarm/domain/policy';

export interface AlarmPolicyRepository {
  listEnabled(): Promise<readonly AlarmPolicy[]>;
  listEnabledForTarget(
    targetType: AlarmPolicy['targetType'],
    targetId: string,
  ): Promise<readonly AlarmPolicy[]>;
  getById(id: string): Promise<AlarmPolicy | null>;
}
