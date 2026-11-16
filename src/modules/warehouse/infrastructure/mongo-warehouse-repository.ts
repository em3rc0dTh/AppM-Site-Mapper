import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import type { AssetTemplate } from '@/modules/warehouse/domain/template';

type WarehouseDocument = AssetTemplate & Document;

function toDomain(document: WarehouseDocument): AssetTemplate {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as AssetTemplate;
}

export class MongoWarehouseRepository implements WarehouseRepository {
  private readonly collection: Collection<WarehouseDocument>;

  constructor(database: Db) {
    this.collection = database.collection<WarehouseDocument>('warehouse_templates');
  }

  async getById(id: string): Promise<AssetTemplate | null> {
    const document = await this.collection.findOne({ id, kind: 'EQUIPMENT' });
    return document ? toDomain(document) : null;
  }

  async listActive(): Promise<readonly AssetTemplate[]> {
    const documents = await this.collection
      .find({ lifecycle: 'ACTIVE', kind: 'EQUIPMENT' })
      .sort({ name: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async insert(template: AssetTemplate): Promise<void> {
    await this.collection.insertOne(template as OptionalUnlessRequiredId<WarehouseDocument>);
  }
}
