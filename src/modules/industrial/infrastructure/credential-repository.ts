import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { IndustrialCredentialRecord } from '@/modules/industrial/domain/credential';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface IndustrialCredentialRepository {
  get(equipmentId: string): Promise<IndustrialCredentialRecord | null>;
  save(next: IndustrialCredentialRecord, expectedRevision: number | null): Promise<boolean>;
  remove(equipmentId: string, expectedRevision: number): Promise<boolean>;
}

class MemoryIndustrialCredentials implements IndustrialCredentialRepository {
  private readonly records = new Map<string, IndustrialCredentialRecord>();

  async get(equipmentId: string) {
    const record = this.records.get(equipmentId);
    return record ? structuredClone(record) : null;
  }

  async save(next: IndustrialCredentialRecord, expectedRevision: number | null) {
    const previous = this.records.get(next.equipmentId);
    if ((previous?.revisionNumber ?? null) !== expectedRevision) return false;
    this.records.set(next.equipmentId, structuredClone(next));
    return true;
  }

  async remove(equipmentId: string, expectedRevision: number) {
    const previous = this.records.get(equipmentId);
    if (!previous || previous.revisionNumber !== expectedRevision) return false;
    return this.records.delete(equipmentId);
  }
}

class MongoIndustrialCredentials implements IndustrialCredentialRepository {
  private readonly records: Collection<IndustrialCredentialRecord & Document>;

  constructor(db: Db) {
    this.records = db.collection<IndustrialCredentialRecord & Document>('industrial_credentials');
  }

  private toDomain(
    document: (IndustrialCredentialRecord & Document) | null,
  ): IndustrialCredentialRecord | null {
    if (!document) return null;
    const value = { ...document } as Record<string, unknown>;
    delete value._id;
    return value as unknown as IndustrialCredentialRecord;
  }

  async get(equipmentId: string) {
    return this.toDomain(await this.records.findOne({ equipmentId }));
  }

  async save(next: IndustrialCredentialRecord, expectedRevision: number | null) {
    if (expectedRevision === null) {
      try {
        await this.records.insertOne(
          next as OptionalUnlessRequiredId<IndustrialCredentialRecord & Document>,
        );
        return true;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
          return false;
        throw error;
      }
    }
    const result = await this.records.replaceOne(
      { equipmentId: next.equipmentId, revisionNumber: expectedRevision },
      next,
    );
    return result.matchedCount === 1;
  }

  async remove(equipmentId: string, expectedRevision: number) {
    const result = await this.records.deleteOne({ equipmentId, revisionNumber: expectedRevision });
    return result.deletedCount === 1;
  }
}

export async function createIndustrialCredentialRepository():
  Promise<IndustrialCredentialRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<IndustrialCredentialRepository>(
      'industrial-credentials',
      () => new MemoryIndustrialCredentials(),
    );
  }
  return new MongoIndustrialCredentials(await getMongoDatabase());
}
