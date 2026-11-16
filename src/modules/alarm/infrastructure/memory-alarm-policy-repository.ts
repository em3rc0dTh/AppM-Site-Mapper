import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';

export class MemoryAlarmPolicyRepository implements AlarmPolicyRepository {
  constructor(private readonly policies: readonly AlarmPolicy[] = []) {}

  async listEnabled(): Promise<readonly AlarmPolicy[]> {
    return this.policies.filter((item) => item.enabled);
  }

  async listEnabledForTarget(
    targetType: AlarmPolicy['targetType'],
    targetId: string,
  ): Promise<readonly AlarmPolicy[]> {
    return this.policies.filter(
      (item) => item.enabled && item.targetType === targetType && item.targetId === targetId,
    );
  }

  async getById(id: string): Promise<AlarmPolicy | null> {
    return this.policies.find((item) => item.id === id) ?? null;
  }
}
