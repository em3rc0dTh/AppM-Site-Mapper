import type { TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

export interface TopologyRepository {
  commitLayout?(before: readonly TopologyNode[], after: readonly TopologyNode[]): Promise<boolean>;
  getById(id: string): Promise<TopologyNode | null>;
  listChildren(parentId: string): Promise<readonly TopologyNode[]>;
  listByKind(kind: TopologyKind): Promise<readonly TopologyNode[]>;
  insert(node: TopologyNode): Promise<void>;
  replace(node: TopologyNode): Promise<void>;
}
