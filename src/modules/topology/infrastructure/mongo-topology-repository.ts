import { versionFilter, nextTopologyVersion } from './topology-version';
import {
  withIntegrityTransaction,
  integritySession,
  integrityOptions,
  IntegrityConflict,
} from '@/shared/infrastructure/mongodb/integrity-transaction';
import { guardTopologyWrite } from '@/shared/infrastructure/mongodb/reference-guards';
import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode, TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';
import { hydrateTopologyDocument } from '@/modules/topology/infrastructure/topology-document-hydration';

type TopologyDocument = TopologyNode & Document;

function toDomain(document: TopologyDocument): TopologyNode {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return hydrateTopologyDocument(copy);
}

export class MongoTopologyRepository implements TopologyRepository {
  private readonly collection: Collection<TopologyDocument>;

  constructor(private readonly database: Db) {
    this.collection = database.collection<TopologyDocument>('topology_nodes');
  }

  async commitLayout(
    before: readonly TopologyNode[],
    after: readonly TopologyNode[],
  ): Promise<boolean> {
    try {
      await withIntegrityTransaction(this.database, async (session) => {
        for (const expected of before) {
          if (!(await this.collection.findOne(versionFilter(expected), { session })))
            throw new Error('LAYOUT_CONFLICT');
        }
        const old = new Map(before.map((node) => [node.id, node]));
        for (const node of after) {
          const previous = old.get(node.id);
          if (previous) {
            const result = await this.collection.replaceOne(
              versionFilter(previous),
              nextTopologyVersion(node, previous) as OptionalUnlessRequiredId<TopologyDocument>,
              { session },
            );
            if (result.matchedCount !== 1) throw new Error('LAYOUT_CONFLICT');
          } else {
            await this.collection.insertOne(
              nextTopologyVersion(node) as OptionalUnlessRequiredId<TopologyDocument>,
              {
                session,
              },
            );
          }
        }
        // Validate the final transactional layout, including newly inserted parents.
        for (const node of after)
          await guardTopologyWrite(this.database, node, session, old.get(node.id));
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'LAYOUT_CONFLICT') {
        if (integritySession()) throw new IntegrityConflict('LAYOUT_CONFLICT');
        return false;
      }
      throw error;
    }
  }

  async getById(id: string): Promise<TopologyNode | null> {
    const document = await this.collection.findOne({ id }, integrityOptions());
    return document ? toDomain(document) : null;
  }

  async findActiveBySerialNumber(serialNumber: string): Promise<readonly TopologyNode[]> {
    const documents = await this.collection
      .find({
        serialNumber,
        kind: { $in: ['DEVICE', 'EQUIPMENT'] },
        lifecycle: 'ACTIVE',
      })
      .limit(3)
      .toArray();
    return documents.map(toDomain);
  }

  async listChildren(parentId: string): Promise<readonly TopologyNode[]> {
    const documents = await this.collection.find({ parentId }).sort({ name: 1 }).toArray();
    return documents.map(toDomain);
  }

  async listByKind(kind: TopologyKind): Promise<readonly TopologyNode[]> {
    const documents = await this.collection.find({ kind }).sort({ name: 1 }).toArray();
    return documents.map(toDomain);
  }

  async listEquipmentForDevice(deviceId: string): Promise<readonly EquipmentNode[]> {
    const documents = await this.collection
      .find({ kind: 'EQUIPMENT', deviceId })
      .sort({ name: 1 })
      .toArray();

    return documents.map((document) => toDomain(document) as EquipmentNode);
  }

  async getEquipmentByAccessPortId(accessPortId: string): Promise<EquipmentNode | null> {
    const document = await this.collection.findOne({
      kind: 'EQUIPMENT',
      'accessPorts.id': accessPortId,
    });

    return document ? (toDomain(document) as EquipmentNode) : null;
  }

  async insert(node: TopologyNode): Promise<void> {
    await withIntegrityTransaction(this.database, async (session) => {
      await this.collection.insertOne(
        nextTopologyVersion(node) as OptionalUnlessRequiredId<TopologyDocument>,
        { session },
      );
      await guardTopologyWrite(this.database, node, session);
    });
  }

  async replace(node: TopologyNode): Promise<void> {
    if (!(await this.commitLayout([node], [node]))) throw new IntegrityConflict('LAYOUT_CONFLICT');
  }

  async replaceIfVersion(node: TopologyNode, expectedVersion: string): Promise<boolean> {
    // Preserve the timestamp API used by spatial clients as an additional precondition.
    return withIntegrityTransaction(this.database, async (session) => {
      const current = await this.collection.findOne(
        { id: node.id, updatedAt: expectedVersion, lifecycle: 'ACTIVE' },
        { session },
      );
      if (!current || current.revision !== node.revision) return false;
      const result = await this.collection.replaceOne(
        versionFilter(toDomain(current)),
        nextTopologyVersion(node, toDomain(current)) as OptionalUnlessRequiredId<TopologyDocument>,
        { session },
      );
      if (result.matchedCount !== 1) return false;
      await guardTopologyWrite(this.database, node, session, toDomain(current));
      return true;
    });
  }
}
