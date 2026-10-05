import { getClient } from '@/shared/infrastructure/mongodb/client';
import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode, TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

type TopologyDocument = TopologyNode & Document;

function toDomain(document: TopologyDocument): TopologyNode {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as TopologyNode;
}

export class MongoTopologyRepository implements TopologyRepository {
  private readonly collection: Collection<TopologyDocument>;

  constructor(database: Db) {
    this.collection = database.collection<TopologyDocument>('topology_nodes');
  }

  async commitLayout(
    before: readonly TopologyNode[],
    after: readonly TopologyNode[],
  ): Promise<boolean> {
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        const old = new Map(before.map((node) => [node.id, node]));
        for (const node of after) {
          const previous = old.get(node.id);
          if (previous) {
            const result = await this.collection.replaceOne(
              { id: node.id, updatedAt: previous.updatedAt },
              node as OptionalUnlessRequiredId<TopologyDocument>,
              { session },
            );
            if (result.matchedCount !== 1) throw new Error('LAYOUT_CONFLICT');
          } else {
            await this.collection.insertOne(node as OptionalUnlessRequiredId<TopologyDocument>, {
              session,
            });
          }
        }
      });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'LAYOUT_CONFLICT') return false;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async getById(id: string): Promise<TopologyNode | null> {
    const document = await this.collection.findOne({ id });
    return document ? toDomain(document) : null;
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
    await this.collection.insertOne(node as OptionalUnlessRequiredId<TopologyDocument>);
  }

  async replace(node: TopologyNode): Promise<void> {
    const result = await this.collection.replaceOne(
      { id: node.id },
      node as OptionalUnlessRequiredId<TopologyDocument>,
    );

    if (result.matchedCount !== 1) {
      throw new Error(`Topology node does not exist: ${node.id}`);
    }
  }

  async replaceIfVersion(node: TopologyNode, expectedVersion: string): Promise<boolean> {
    const result = await this.collection.replaceOne(
      { id: node.id, updatedAt: expectedVersion, lifecycle: 'ACTIVE' },
      node as OptionalUnlessRequiredId<TopologyDocument>,
    );
    return result.matchedCount === 1;
  }
}
