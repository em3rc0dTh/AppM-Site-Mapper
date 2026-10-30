import type { Collection, Db, Document } from 'mongodb';

import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';

type AlarmPolicyDocument = AlarmPolicy & Document;

function toDomain(document: AlarmPolicyDocument): AlarmPolicy {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as AlarmPolicy;
}

export class MongoAlarmPolicyRepository implements AlarmPolicyRepository {
  private readonly collection: Collection<AlarmPolicyDocument>;

  constructor(database: Db) {
    this.collection = database.collection<AlarmPolicyDocument>('alarm_policies');
  }

  async listEnabled(): Promise<readonly AlarmPolicy[]> {
    return (await this.collection.find({ enabled: true }).toArray()).map(toDomain);
  }

  async listEnabledForTarget(
    targetType: AlarmPolicy['targetType'],
    targetId: string,
  ): Promise<readonly AlarmPolicy[]> {
    return (
      await this.collection.find({ enabled: true, targetType, targetId }).toArray()
    ).map(toDomain);
  }

  async getById(id: string): Promise<AlarmPolicy | null> {
    const document = await this.collection.findOne({ id });
    return document ? toDomain(document) : null;
  }
}
