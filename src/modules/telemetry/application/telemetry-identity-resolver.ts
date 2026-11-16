import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';

/** Identity belongs to the physical node. The parent is context, never a substitute SN. */
export class TelemetryIdentityResolver {
  constructor(private readonly repository: TopologyRepository) {}

  async valid(node: TopologyNode): Promise<boolean> {
    if (node.lifecycle !== 'ACTIVE') return false;
    if (node.kind === 'DEVICE') return true;
    if (node.kind !== 'EQUIPMENT') return false;
    const device = await this.repository.getById(node.deviceId);
    if (device?.kind !== 'DEVICE' || device.lifecycle !== 'ACTIVE') return false;
    const visited = new Set<string>();
    let current = node;
    while (true) {
      if (visited.has(current.id)) return false;
      visited.add(current.id);
      if (current.parentEquipmentId === null) {
        return current.parentId === device.id && device.rootEquipmentIds.includes(current.id);
      }
      const parent = await this.repository.getById(current.parentEquipmentId);
      if (
        parent?.kind !== 'EQUIPMENT' ||
        parent.lifecycle !== 'ACTIVE' ||
        parent.deviceId !== device.id ||
        current.parentId !== parent.id ||
        !parent.children.includes(current.id)
      )
        return false;
      current = parent;
    }
  }
}
