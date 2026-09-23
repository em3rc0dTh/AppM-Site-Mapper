import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode, EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type InventoryItem = DeviceNode | EquipmentNode;
export type InventoryError =
  | 'RACK_NOT_FOUND'
  | 'NOT_A_CONTAINER_RACK'
  | 'ITEM_NOT_FOUND'
  | 'NOT_INVENTORY_ITEM';

export class InventoryService {
  constructor(private readonly repository: TopologyRepository) {}

  async listRackInventory(
    rackId: string,
  ): Promise<Result<readonly InventoryItem[], InventoryError>> {
    const rack = await this.repository.getById(rackId);

    if (!rack) {
      return failure('RACK_NOT_FOUND');
    }

    if (rack.kind !== 'CONTAINER_RACK') {
      return failure('NOT_A_CONTAINER_RACK');
    }

    const children = await this.repository.listChildren(rack.id);
    const items = children.filter(
      (node): node is InventoryItem =>
        node.lifecycle === 'ACTIVE' && (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT'),
    );

    return success(items);
  }

  async getInventoryItem(id: string): Promise<InventoryItem | null> {
    const node: TopologyNode | null = await this.repository.getById(id);

    if (!node || (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT')) {
      return null;
    }

    return node;
  }

  async setPinned(id: string, pinned: boolean): Promise<Result<InventoryItem, InventoryError>> {
    const node = await this.repository.getById(id);

    if (!node) {
      return failure('ITEM_NOT_FOUND');
    }

    if (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') {
      return failure('NOT_INVENTORY_ITEM');
    }

    const updated: InventoryItem = {
      ...node,
      pinned,
      updatedAt: nowIso(),
    };

    await this.repository.replace(updated);
    return success(updated);
  }
}
