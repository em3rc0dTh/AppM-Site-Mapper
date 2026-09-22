import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

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
}
