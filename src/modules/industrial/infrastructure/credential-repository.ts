import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type {
  IndustrialCredentialEvent,
  IndustrialCredentialRecord,
} from '@/modules/industrial/domain/credential';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getClient, getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface IndustrialCredentialRepository {
  get(equipmentId: string): Promise<IndustrialCredentialRecord | null>;
  saveWithEvent(
    next: IndustrialCredentialRecord,
    expectedRevision: number | null,
    event: IndustrialCredentialEvent,
  ): Promise<boolean>;
  appendEvent(event: IndustrialCredentialEvent): Promise<void>;
  removeWithEvent(
    equipmentId: string,
    expectedRevision: number,
    event: IndustrialCredentialEvent,
  ): Promise<boolean>;
  listEvents(equipmentId: string, limit?: number): Promise<readonly IndustrialCredentialEvent[]>;
}

class MemoryIndustrialCredentials implements IndustrialCredentialRepository {
  private readonly records = new Map<string, IndustrialCredentialRecord>();

  async get(equipmentId: string) {
    const record = this.records.get(equipmentId);
    return record ? structuredClone(record) : null;
  }

  private readonly events: IndustrialCredentialEvent[] = [];

  async saveWithEvent(
    next: IndustrialCredentialRecord,
    expectedRevision: number | null,
    event: IndustrialCredentialEvent,
  ) {
    const previous = this.records.get(next.equipmentId);
    if ((previous?.revisionNumber ?? null) !== expectedRevision) return false;
    this.records.set(next.equipmentId, structuredClone(next));
    this.events.push(structuredClone(event));
    return true;
  }

  async appendEvent(event: IndustrialCredentialEvent) {
    this.events.push(structuredClone(event));
  }

  async removeWithEvent(
    equipmentId: string,
    expectedRevision: number,
    event: IndustrialCredentialEvent,
  ) {
    const previous = this.records.get(equipmentId);
    if (!previous || previous.revisionNumber !== expectedRevision) return false;
    this.records.delete(equipmentId);
    this.events.push(structuredClone(event));
    return true;
  }

  async listEvents(equipmentId: string, limit = 20) {
    return this.events
      .filter((event) => event.equipmentId === equipmentId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit)
      .map((event) => structuredClone(event));
  }
}

class MongoIndustrialCredentials implements IndustrialCredentialRepository {
  private readonly records: Collection<IndustrialCredentialRecord & Document>;
  private readonly events: Collection<IndustrialCredentialEvent & Document>;

  constructor(db: Db) {
    this.records = db.collection<IndustrialCredentialRecord & Document>('industrial_credentials');
    this.events = db.collection<IndustrialCredentialEvent & Document>(
      'industrial_credential_events',
    );
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

  async saveWithEvent(
    next: IndustrialCredentialRecord,
    expectedRevision: number | null,
    event: IndustrialCredentialEvent,
  ) {
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        if (expectedRevision === null) {
          await this.records.insertOne(
            next as OptionalUnlessRequiredId<IndustrialCredentialRecord & Document>,
            { session },
          );
        } else {
          const result = await this.records.replaceOne(
            { equipmentId: next.equipmentId, revisionNumber: expectedRevision },
            next,
            { session },
          );
          if (result.matchedCount !== 1) throw new Error('CREDENTIAL_CONFLICT');
        }
        await this.events.insertOne(
          event as OptionalUnlessRequiredId<IndustrialCredentialEvent & Document>,
          { session },
        );
      });
      return true;
    } catch (error) {
      if (
        (error instanceof Error && error.message === 'CREDENTIAL_CONFLICT') ||
        (error && typeof error === 'object' && 'code' in error && error.code === 11000)
      )
        return false;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async appendEvent(event: IndustrialCredentialEvent) {
    await this.events.insertOne(
      event as OptionalUnlessRequiredId<IndustrialCredentialEvent & Document>,
    );
  }

  async removeWithEvent(
    equipmentId: string,
    expectedRevision: number,
    event: IndustrialCredentialEvent,
  ) {
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        const result = await this.records.deleteOne(
          { equipmentId, revisionNumber: expectedRevision },
          { session },
        );
        if (result.deletedCount !== 1) throw new Error('CREDENTIAL_CONFLICT');
        await this.events.insertOne(
          event as OptionalUnlessRequiredId<IndustrialCredentialEvent & Document>,
          { session },
        );
      });
      return true;
    } catch (error) {
      if (
        (error instanceof Error && error.message === 'CREDENTIAL_CONFLICT') ||
        (error && typeof error === 'object' && 'code' in error && error.code === 11000)
      )
        return false;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listEvents(equipmentId: string, limit = 20) {
    const documents = await this.events
      .find({ equipmentId })
      .sort({ occurredAt: -1 })
      .limit(Math.max(1, Math.min(limit, 100)))
      .toArray();
    return documents.map((document) => {
      const value = { ...document } as Record<string, unknown>;
      delete value._id;
      return value as unknown as IndustrialCredentialEvent;
    });
  }
}

export async function createIndustrialCredentialRepository(): Promise<IndustrialCredentialRepository> {
  if (getPersistenceMode() === 'memory') {
    return getProcessSingleton<IndustrialCredentialRepository>(
      'industrial-credentials',
      () => new MemoryIndustrialCredentials(),
    );
  }
  return new MongoIndustrialCredentials(await getMongoDatabase());
}
