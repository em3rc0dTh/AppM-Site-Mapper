import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

export class MemoryTopologyRepository implements TopologyRepository {
  private readonly nodes = new Map<string, TopologyNode>();

  constructor(seed: readonly TopologyNode[] = []) {
    for (const node of seed) {
      if (this.nodes.has(node.id)) {
        throw new Error(`Duplicate topology id: ${node.id}`);
      }
      this.nodes.set(node.id, structuredClone(node));
    }
  }

  async getById(id: string): Promise<TopologyNode | null> {
    const node = this.nodes.get(id);
    return node ? structuredClone(node) : null;
  }

  async listChildren(parentId: string): Promise<readonly TopologyNode[]> {
    return [...this.nodes.values()]
      .filter((node) => node.parentId === parentId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((node) => structuredClone(node));
  }

  async listByKind(kind: TopologyKind): Promise<readonly TopologyNode[]> {
    return [...this.nodes.values()]
      .filter((node) => node.kind === kind)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((node) => structuredClone(node));
  }

  async insert(node: TopologyNode): Promise<void> {
    if (this.nodes.has(node.id)) {
      throw new Error(`Topology node already exists: ${node.id}`);
    }
    this.nodes.set(node.id, structuredClone(node));
  }

  async replace(node: TopologyNode): Promise<void> {
    if (!this.nodes.has(node.id)) {
      throw new Error(`Topology node does not exist: ${node.id}`);
    }
    this.nodes.set(node.id, structuredClone(node));
  }
}
