import { IntegrityConflict } from '@/shared/infrastructure/mongodb/integrity-transaction';
import { nextTopologyVersion, sameTopologyVersion } from './topology-version';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode, TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

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
    if (
      before.some(
        (node) => !this.nodes.has(node.id) || !sameTopologyVersion(this.nodes.get(node.id)!, node),
      )
    )
      return false;
    const existing = new Set(before.map((node) => node.id));
    if (after.some((node) => !existing.has(node.id) && this.nodes.has(node.id))) return false;
    const finalNodes = new Map(this.nodes);
    for (const node of after) finalNodes.set(node.id, node);
    const occupied = new Set<string>();
    for (const node of finalNodes.values())
      if (node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE') {
        if (occupied.has(node.parentId)) throw new IntegrityConflict('POSITION_OCCUPIED');
        occupied.add(node.parentId);
      }
    for (const node of after)
      this.nodes.set(
        node.id,
        structuredClone(
          nextTopologyVersion(
            node,
            before.find((old) => old.id === node.id),
          ),
        ),
      );
    return true;
  }

  async getById(id: string): Promise<TopologyNode | null> {
    const node = this.nodes.get(id);
    return node ? structuredClone(node) : null;
  }

  async findActiveBySerialNumber(serialNumber: string): Promise<readonly TopologyNode[]> {
    return [...this.nodes.values()]
      .filter(
        (node) =>
          (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') &&
          node.lifecycle === 'ACTIVE' &&
          node.serialNumber === serialNumber,
      )
      .map((node) => structuredClone(node));
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

  async listEquipmentForDevice(deviceId: string): Promise<readonly EquipmentNode[]> {
    return [...this.nodes.values()]
      .filter(
        (node): node is EquipmentNode => node.kind === 'EQUIPMENT' && node.deviceId === deviceId,
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((node) => structuredClone(node));
  }

  async getEquipmentByAccessPortId(accessPortId: string): Promise<EquipmentNode | null> {
    const match = [...this.nodes.values()].find(
      (node): node is EquipmentNode =>
        node.kind === 'EQUIPMENT' && node.accessPorts.some((port) => port.id === accessPortId),
    );
    return match ? structuredClone(match) : null;
  }

  async insert(node: TopologyNode): Promise<void> {
    if (this.nodes.has(node.id)) {
      throw new Error(`Topology node already exists: ${node.id}`);
    }
    this.nodes.set(node.id, structuredClone(node));
  }

  async replace(node: TopologyNode): Promise<void> {
    if (!this.nodes.has(node.id) || !sameTopologyVersion(this.nodes.get(node.id)!, node)) {
      throw new Error('LAYOUT_CONFLICT');
    }
    this.nodes.set(node.id, structuredClone(nextTopologyVersion(node, node)));
  }

  async replaceIfVersion(node: TopologyNode, expectedVersion: string): Promise<boolean> {
    const current = this.nodes.get(node.id);
    if (
      !current ||
      current.updatedAt !== expectedVersion ||
      current.revision !== node.revision ||
      current.lifecycle !== 'ACTIVE'
    ) {
      return false;
    }
    this.nodes.set(node.id, structuredClone(nextTopologyVersion(node, node)));
    return true;
  }
}
