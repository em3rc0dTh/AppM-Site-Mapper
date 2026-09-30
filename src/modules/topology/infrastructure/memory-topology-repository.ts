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

  async commitLayout(
    before: readonly TopologyNode[],
    after: readonly TopologyNode[],
  ): Promise<boolean> {
    if (before.some((node) => this.nodes.get(node.id)?.updatedAt !== node.updatedAt)) return false;
    const existing = new Set(before.map((node) => node.id));
    if (after.some((node) => !existing.has(node.id) && this.nodes.has(node.id))) return false;
    for (const node of after) this.nodes.set(node.id, structuredClone(node));
    return true;
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

  async replaceIfVersion(node: TopologyNode, expectedVersion: string): Promise<boolean> {
    const current = this.nodes.get(node.id);
    if (!current || current.updatedAt !== expectedVersion || current.lifecycle !== 'ACTIVE')
      return false;
    this.nodes.set(node.id, structuredClone(node));
    return true;
  }
}
