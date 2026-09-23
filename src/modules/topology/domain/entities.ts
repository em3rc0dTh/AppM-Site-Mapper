import type { DomainEntity } from '@/shared/domain/entity';

export type TopologyKind =
  | 'NETWORK'
  | 'SITE'
  | 'STRUCTURE'
  | 'LEVEL'
  | 'ROOM_SUBSTRUCTURE'
  | 'CONTAINER_CLUSTER_BAY'
  | 'POSITION'
  | 'CONTAINER_RACK'
  | 'DEVICE'
  | 'EQUIPMENT';

export type RoomSubstructureVariant = 'ROOM' | 'SUBSTRUCTURE';
export type ContainerClusterBayVariant = 'CONTAINER_CLUSTER' | 'BAY';
export type ContainerRackVariant = 'CONTAINER' | 'RACK';
export type BreakerHolderVariant = 'BREAKER' | 'HOLDER';
export type CasState = 'AVAILABLE' | 'RESERVED' | 'EQUIPPED';

export interface GridCoordinate {
  readonly row: string;
  readonly column: number;
}

export interface DimensionsMm {
  readonly width: number;
  readonly depth: number;
  readonly height?: number;
}

export interface CasRange {
  readonly id: string;
  readonly startU: number;
  readonly endU: number;
  readonly state: CasState;
  readonly occupantId?: string;
  readonly mountStartU?: number;
  readonly physicalSizeU?: number;
  readonly clearanceTopU?: number;
  readonly clearanceBottomU?: number;
}

export interface BreakerHolder {
  readonly id: string;
  readonly variant: BreakerHolderVariant;
  readonly label: string;
  readonly capacity?: number;
}

export interface Panel {
  readonly id: string;
  readonly label: string;
  readonly endpoints: readonly BreakerHolder[];
}

export interface Frame {
  readonly id: string;
  readonly label: string;
  readonly panels: readonly Panel[];
}

export interface Shelf {
  readonly id: string;
  readonly label: string;
  readonly frames: readonly Frame[];
}

export interface BdfbStructure {
  readonly shelves: readonly Shelf[];
}

interface TopologyBase extends DomainEntity {
  readonly parentId: string | null;
  readonly name: string;
  readonly kind: TopologyKind;
}

export interface NetworkNode extends TopologyBase {
  readonly kind: 'NETWORK';
  readonly parentId: null;
}

export interface SiteNode extends TopologyBase {
  readonly kind: 'SITE';
  readonly parentId: string;
}

export interface StructureNode extends TopologyBase {
  readonly kind: 'STRUCTURE';
  readonly parentId: string;
}

export interface LevelNode extends TopologyBase {
  readonly kind: 'LEVEL';
  readonly parentId: string;
}

export interface RoomSubstructureNode extends TopologyBase {
  readonly kind: 'ROOM_SUBSTRUCTURE';
  readonly parentId: string;
  readonly variant: RoomSubstructureVariant;
  readonly polygon?: readonly Readonly<{ x: number; y: number }>[];
}

export interface ContainerClusterBayNode extends TopologyBase {
  readonly kind: 'CONTAINER_CLUSTER_BAY';
  readonly parentId: string;
  readonly variant: ContainerClusterBayVariant;
}

export interface PositionNode extends TopologyBase {
  readonly kind: 'POSITION';
  readonly parentId: string;
  readonly coordinate: GridCoordinate;
}

export interface ContainerRackNode extends TopologyBase {
  readonly kind: 'CONTAINER_RACK';
  readonly parentId: string;
  readonly variant: ContainerRackVariant;
  readonly dimensionsMm?: DimensionsMm;
  readonly totalU?: number;
  readonly cas: readonly CasRange[];
}

export interface DeviceNode extends TopologyBase {
  readonly kind: 'DEVICE';
  readonly parentId: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly pinned: boolean;
  readonly deviceType?: string;
  readonly bdfb?: BdfbStructure;
}

export interface EquipmentNode extends TopologyBase {
  readonly kind: 'EQUIPMENT';
  readonly parentId: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly pinned: boolean;
  readonly equipmentType?: string;
}

export type TopologyNode =
  | NetworkNode
  | SiteNode
  | StructureNode
  | LevelNode
  | RoomSubstructureNode
  | ContainerClusterBayNode
  | PositionNode
  | ContainerRackNode
  | DeviceNode
  | EquipmentNode;
