import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerPath } from '@/modules/power/domain/entities';

type PowerPathDocument = PowerPath & Document;

function toDomain(document: PowerPathDocument): PowerPath {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as PowerPath;
}

export class MongoPowerRepository implements PowerRepository {
  private readonly collection: Collection<PowerPathDocument>;

  constructor(database: Db) {
    this.collection = database.collection<PowerPathDocument>('power_paths');
  }

  async getById(id: string): Promise<PowerPath | null> {
    const document = await this.collection.findOne({ id });
    return document ? toDomain(document) : null;
  }

  async listActive(): Promise<readonly PowerPath[]> {
    const documents = await this.collection
      .find({ lifecycle: 'ACTIVE' })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map(toDomain);
  }

  async listForEntity(entityId: string): Promise<readonly PowerPath[]> {
    const documents = await this.collection
      .find({
        lifecycle: 'ACTIVE',
        $or: [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return documents.map(toDomain);
  }

  async insert(path: PowerPath): Promise<void> {
    await this.collection.insertOne(path as OptionalUnlessRequiredId<PowerPathDocument>);
  }

  async replace(path: PowerPath): Promise<void> {
    const result = await this.collection.replaceOne(
      { id: path.id },
      path as OptionalUnlessRequiredId<PowerPathDocument>,
    );

    if (result.matchedCount !== 1) {
      throw new Error(`PowerPath does not exist: ${path.id}`);
    }
  }
}
