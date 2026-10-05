import type { EquipmentNode, TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

export interface TopologyRepository {
  replaceIfVersion?(node: TopologyNode, expectedVersion: string): Promise<boolean>;
  commitLayout?(before: readonly TopologyNode[], after: readonly TopologyNode[]): Promise<boolean>;
  getById(id: string): Promise<TopologyNode | null>;
  listChildren(parentId: string): Promise<readonly TopologyNode[]>;
  listByKind(kind: TopologyKind): Promise<readonly TopologyNode[]>;
  listEquipmentForDevice(deviceId: string): Promise<readonly EquipmentNode[]>;
  getEquipmentByAccessPortId(accessPortId: string): Promise<EquipmentNode | null>;
  insert(node: TopologyNode): Promise<void>;
  replace(node: TopologyNode): Promise<void>;
}
