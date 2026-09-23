import type { DeviceNode, EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';

export type InventoryNode = DeviceNode | EquipmentNode;
export type InventoryKind = InventoryNode['kind'];

export interface InventoryProfile {
  readonly id: string;
  readonly rackId: string;
  readonly kind: InventoryKind;
  readonly name: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly type?: string;
  readonly pinned: boolean;
  readonly lifecycle: InventoryNode['lifecycle'];
}

export function isInventoryNode(node: TopologyNode | null): node is InventoryNode {
  return node?.kind === 'DEVICE' || node?.kind === 'EQUIPMENT';
}

export function toInventoryProfile(node: InventoryNode): InventoryProfile {
  return {
    id: node.id,
    rackId: node.parentId,
    kind: node.kind,
    name: node.name,
    ...(node.serialNumber ? { serialNumber: node.serialNumber } : {}),
    ...(node.category ? { category: node.category } : {}),
    ...(node.kind === 'DEVICE' && node.deviceType ? { type: node.deviceType } : {}),
    ...(node.kind === 'EQUIPMENT' && node.equipmentType ? { type: node.equipmentType } : {}),
    pinned: node.pinned,
    lifecycle: node.lifecycle,
  };
}
