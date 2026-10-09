import type { DomainEntity } from '@/shared/domain/entity';
import type { AssetTemplateSnapshot } from '@/modules/warehouse/domain/template';

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
export type CasState = 'AVAILABLE' | 'RESERVED' | 'EQUIPPED';

export type DeviceType =
  'NETWORK_ELEMENT' | 'BDFB' | 'SERVER' | 'UPS' | 'RECTIFIER' | 'POWER_SYSTEM' | 'CUSTOM';

export type EquipmentType =
  | 'CHASSIS'
  | 'SHELF'
  | 'SUB_SHELF'
  | 'FRAME'
  | 'PANEL'
  | 'CIRCUIT_BREAKER'
  | 'POWER_SUPPLY'
  | 'POWER_MODULE'
  | 'CONTROLLER_BOARD'
  | 'NETWORK_BOARD'
  | 'PLUGGABLE_MODULE'
  | 'FAN'
  | 'CUSTOM';

export type EquipmentFunction =
  'CONTROL' | 'NETWORKING' | 'POWER_CONVERSION' | 'POWER_DISTRIBUTION' | 'PROTECTION' | 'COOLING';

export type EquipmentChildMode = 'DYNAMIC' | 'POSITIONAL';
export interface EquipmentPresentation {
  readonly direction: 'ROW' | 'COLUMN';
  readonly maxPerLine: number | null;
  readonly childrenVisibility: 'AUTO' | 'INLINE' | 'SUMMARY';
}
export type AccessPortType = 'POWER' | 'NETWORK' | 'CONTROL' | 'DATA' | 'GROUND' | 'CUSTOM';
export type AccessPortDirection = 'INPUT' | 'OUTPUT' | 'BIDIRECTIONAL';
export type AccessPortExposure = 'INTERNAL' | 'EXTERNAL';

export interface GridCoordinate {
  readonly row: string;
  readonly column: number;
}

export interface PhysicalPoint {
  readonly x: number;
  readonly y: number;
}

export interface SiteOperationalDetails {
  readonly totalPowerCapacity?: number;
  readonly activeAlarms?: number;
  readonly currentLoad?: number;
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

export interface RackPlacement {
  readonly rackId: string;
  readonly mode: 'FULL_RACK' | 'U_RANGE';
  readonly startU?: number;
  readonly sizeU?: number;
  readonly clearanceTopU?: number;
  readonly clearanceBottomU?: number;
}

export interface AccessPort {
  readonly id: string;
  readonly deviceId: string;
  readonly equipmentId: string;
  readonly name: string;
  readonly portType: AccessPortType;
  readonly direction?: AccessPortDirection;
  readonly exposure: AccessPortExposure;
  readonly connectorType?: string;
  readonly protocol?: string;
  readonly customType?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly lifecycle: 'ACTIVE' | 'ARCHIVED';
}

interface TopologyBase extends DomainEntity {
  /**
   * Navigation/context pointer. For Equipment this mirrors the canonical immediate
   * physical parent: root Equipment points to Device; nested Equipment points to
   * its parent Equipment. parentEquipmentId remains the physical authority.
   */
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
  readonly polygon?: readonly PhysicalPoint[];
  readonly category?: string;
  readonly alias?: string;
  readonly district?: string;
  readonly address?: string;
  readonly geoCoords?: string;
  readonly totalAreaSqm?: number;
  readonly details?: SiteOperationalDetails;
}

export interface StructureNode extends TopologyBase {
  readonly kind: 'STRUCTURE';
  readonly parentId: string;
  readonly polygon?: readonly PhysicalPoint[];
}

export interface LevelNode extends TopologyBase {
  readonly kind: 'LEVEL';
  readonly parentId: string;
}

export interface RoomSubstructureNode extends TopologyBase {
  readonly kind: 'ROOM_SUBSTRUCTURE';
  readonly parentId: string;
  readonly variant: RoomSubstructureVariant;
  readonly polygon?: readonly PhysicalPoint[];
}

export interface ContainerClusterBayNode extends TopologyBase {
  readonly kind: 'CONTAINER_CLUSTER_BAY';
  readonly parentId: string;
  readonly variant: ContainerClusterBayVariant;
  readonly polygon?: readonly PhysicalPoint[];
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
  readonly placementMm?: PhysicalPoint;
  readonly dimensionsMm?: DimensionsMm;
  readonly totalU?: number;
  readonly cas: readonly CasRange[];
}

/** Device is the abstract operational identity of a managed system. */
export interface DeviceNode extends TopologyBase {
  readonly kind: 'DEVICE';
  /** Rack is context only; physical occupancy belongs to Equipment.rackPlacement. */
  readonly parentId: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly pinned: boolean;
  readonly deviceType: DeviceType;
  readonly rootEquipmentIds: readonly string[];
  readonly template?: AssetTemplateSnapshot;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Equipment is the canonical physical object in Domain Contract v1.2. */
export interface EquipmentNode extends TopologyBase {
  readonly kind: 'EQUIPMENT';
  readonly parentId: string;
  readonly deviceId: string;
  readonly equipmentType: EquipmentType;
  readonly parentEquipmentId: string | null;
  readonly childMode: EquipmentChildMode;
  readonly presentation?: EquipmentPresentation;
  readonly children: readonly (string | null)[];
  readonly accessPorts: readonly AccessPort[];
  readonly functions?: readonly EquipmentFunction[];
  readonly manufacturer?: string;
  readonly manufacturerTypeName?: string;
  readonly model?: string;
  readonly serialNumber?: string;
  readonly aliases?: readonly string[];
  readonly rackPlacement?: RackPlacement;
  readonly category?: string;
  readonly pinned: boolean;
  readonly template?: AssetTemplateSnapshot;
  readonly attributes?: Readonly<Record<string, unknown>>;
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
