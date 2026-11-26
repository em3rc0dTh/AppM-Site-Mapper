import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { PowerTargetCatalogRepository } from '@/modules/power/application/power-target-catalog-repository';
import type { PowerTargetCatalogEntry } from '@/modules/power/domain/power-target-catalog';

type PowerTargetCatalogDocument = PowerTargetCatalogEntry & Document;

function toDomain(document: PowerTargetCatalogDocument): PowerTargetCatalogEntry {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as PowerTargetCatalogEntry;
}

export class MongoPowerTargetCatalogRepository implements PowerTargetCatalogRepository {
  private readonly collection: Collection<PowerTargetCatalogDocument>;

  constructor(database: Db) {
    this.collection = database.collection<PowerTargetCatalogDocument>('power_target_catalog');
  }

  async listActive(): Promise<readonly PowerTargetCatalogEntry[]> {
    const rows = await this.collection
      .find({ lifecycle: 'ACTIVE' })
      .sort({ displayLabel: 1, rackAid: 1, localAid: 1 })
      .toArray();
    return rows.map(toDomain);
  }

  async getByIdentityKey(identityKey: string): Promise<PowerTargetCatalogEntry | null> {
    const row = await this.collection.findOne({ identityKey, lifecycle: 'ACTIVE' });
    return row ? toDomain(row) : null;
  }

  async insert(target: PowerTargetCatalogEntry): Promise<void> {
    await this.collection.insertOne(
      target as OptionalUnlessRequiredId<PowerTargetCatalogDocument>,
    );
  }
}
