import {
  withIntegrityTransaction,
  IntegrityConflict,
} from '@/shared/infrastructure/mongodb/integrity-transaction';
import { requireActiveAncestry } from '@/shared/infrastructure/mongodb/reference-guards';
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

  constructor(private readonly database: Db) {
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

  async listForAccessPort(accessPortId: string): Promise<readonly PowerPath[]> {
    const documents = await this.collection
      .find({
        lifecycle: 'ACTIVE',
        $or: [{ sourceAccessPortId: accessPortId }, { targetAccessPortId: accessPortId }],
      })
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map(toDomain);
  }

  async insert(path: PowerPath): Promise<void> {
    await withIntegrityTransaction(this.database, async (session) => {
      const endpoints = [];
      for (const id of [path.sourceAccessPortId, path.targetAccessPortId]) {
        const owner = await this.database.collection('topology_nodes').findOne(
          {
            kind: 'EQUIPMENT',
            lifecycle: 'ACTIVE',
            accessPorts: {
              $elemMatch: { id, lifecycle: 'ACTIVE', portType: 'POWER', exposure: 'EXTERNAL' },
            },
          },
          { session },
        );
        if (!owner) throw new IntegrityConflict('REFERENCE_NOT_ACTIVE');
        await requireActiveAncestry(this.database, owner.id, session);
        endpoints.push(owner.accessPorts.find((port: { id: string }) => port.id === id));
      }
      if (endpoints[0].direction === 'INPUT' || endpoints[1].direction === 'OUTPUT')
        throw new IntegrityConflict('INVALID_POWER_DIRECTION');
      const sourceFeed = endpoints[0].attributes?.feed;
      const targetFeed = endpoints[1].attributes?.feed;
      if (
        (sourceFeed && targetFeed && sourceFeed !== targetFeed) ||
        (path.feed &&
          ((sourceFeed && sourceFeed !== path.feed) || (targetFeed && targetFeed !== path.feed)))
      )
        throw new IntegrityConflict('FEED_MISMATCH');
      await this.collection.insertOne(path as OptionalUnlessRequiredId<PowerPathDocument>, {
        session,
      });
    });
  }

  async replace(path: PowerPath): Promise<void> {
    if (path.lifecycle !== 'ARCHIVED')
      throw new IntegrityConflict('POWER_PATH_REPLACEMENT_FORBIDDEN');
    await withIntegrityTransaction(this.database, async (session) => {
      const result = await this.collection.updateOne(
        {
          id: path.id,
          sourceAccessPortId: path.sourceAccessPortId,
          targetAccessPortId: path.targetAccessPortId,
        },
        { $set: { lifecycle: 'ARCHIVED', updatedAt: path.updatedAt } },
        { session },
      );
      if (result.matchedCount !== 1) throw new IntegrityConflict('POWER_PATH_CONFLICT');
    });
  }
}
