import { parsePolygon, polygonInsidePolygon } from '@/modules/spatial/domain/geometry';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  AccessPort,
  ContainerClusterBayVariant,
  ContainerRackVariant,
  DeviceType,
  EquipmentChildMode,
  EquipmentNode,
  EquipmentType,
  GridCoordinate,
  PhysicalPoint,
  RoomSubstructureVariant,
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';
import { isAllowedParent, topologySlug } from '@/modules/topology/domain/hierarchy';
import { initializeCas } from '@/modules/rack/domain/cas';
import type { AssetTemplateSnapshot } from '@/modules/warehouse/domain/template';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type TopologyError =
  | 'INVALID_POLYGON'
  | 'BOUNDARY_OUTSIDE_SITE'
  | 'BOUNDARY_OUTSIDE_ROOM'
  | 'ATOMIC_LAYOUT_STORAGE_REQUIRED'
  | 'LAYOUT_CONFLICT'
  | 'NOT_FOUND'
  | 'NOT_EQUIPMENT'
  | 'INVALID_NAME'
  | 'INVALID_TEXT_FIELD'
  | 'INVALID_PARENT'
  | 'PARENT_ARCHIVED'
  | 'POSITION_OCCUPIED'
  | 'INVALID_VARIANT'
  | 'INVALID_COORDINATE'
  | 'INVALID_RACK_CAPACITY'
  | 'MOVE_NOT_ALLOWED'
  | 'HAS_ACTIVE_CHILDREN'
  | 'DETACH_REQUIRED'
  | 'CAS_RELEASE_REQUIRED'
  | 'PARENT_ARCHIVED_ON_RESTORE'
  | 'INVALID_DEEP_LINK'
  | 'INVALID_CHILD_CAPACITY'
  | 'POSITION_SLOT_REQUIRED'
  | 'SLOT_OUT_OF_RANGE'
  | 'SLOT_OCCUPIED'
  | 'CHILD_TYPE_NOT_ALLOWED'
  | 'INVALID_DEVICE_OWNERSHIP'
  | 'EQUIPMENT_CYCLE';

export interface ConfigureEquipmentInput {
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  readonly childCapacity?: number;
}

export interface TopologyNavigationNode {
  readonly node: TopologyNode;
  readonly href: string;
  readonly children: readonly TopologyNavigationNode[];
}

export interface CreateTopologyNodeInput {
  readonly kind: TopologyKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly roomVariant?: RoomSubstructureVariant;
  readonly clusterVariant?: ContainerClusterBayVariant;
  readonly containerVariant?: ContainerRackVariant;
  readonly coordinate?: GridCoordinate;
  readonly totalU?: number;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly deviceType?: DeviceType;
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  readonly childCapacity?: number;
  readonly parentSlotIndex?: number;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly accessPorts?: readonly AccessPort[];
  readonly polygon?: readonly PhysicalPoint[];
  readonly template?: AssetTemplateSnapshot;
}

function canonicalChildren(mode: EquipmentChildMode, childCapacity?: number): readonly null[] {
  if (mode === 'DYNAMIC') return [];

  if (
    !Number.isInteger(childCapacity) ||
    (childCapacity ?? 0) < 1 ||
    (childCapacity ?? 0) > 256
  ) {
    throw new Error('INVALID_CHILD_CAPACITY');
  }

  return Array.from({ length: childCapacity as number }, () => null);
}

export class TopologyService {
  constructor(private readonly repository: TopologyRepository) {}

  async getById(id: string): Promise<TopologyNode | null> {
    return this.repository.getById(id);
  }

  async listChildren(parentId: string): Promise<readonly TopologyNode[]> {
    const children = await this.repository.listChildren(parentId);
    return children.filter((node) => node.lifecycle === 'ACTIVE');
  }

  async listNetworks(): Promise<readonly TopologyNode[]> {
    const networks = await this.repository.listByKind('NETWORK');
    return networks.filter((node) => node.lifecycle === 'ACTIVE');
  }

  async create(input: CreateTopologyNodeInput): Promise<Result<TopologyNode, TopologyError>> {
    const name = input.name.trim();

    if (!name || name.length > 120) {
      return failure('INVALID_NAME');
    }

    for (const value of [
      input.serialNumber,
      input.category,
      input.manufacturer,
      input.model,
    ]) {
      if (value !== undefined && value.length > 120) {
        return failure('INVALID_TEXT_FIELD');
      }
    }

    const parent = input.parentId ? await this.repository.getById(input.parentId) : null;

    if (!isAllowedParent(input.kind, parent)) {
      return failure('INVALID_PARENT');
    }

    if (parent?.lifecycle === 'ARCHIVED') {
      return failure('PARENT_ARCHIVED');
    }

    if (input.kind === 'CONTAINER_RACK' && parent && (await this.hasActiveRack(parent.id))) {
      return failure('POSITION_OCCUPIED');
    }

    const spatial = ['SITE', 'STRUCTURE', 'ROOM_SUBSTRUCTURE', 'CONTAINER_CLUSTER_BAY'].includes(
      input.kind,
    );
    const polygon = spatial ? parsePolygon(input.polygon) : null;
    if (spatial && !polygon) return failure('INVALID_POLYGON');
    if (
      input.kind === 'STRUCTURE' &&
      (parent?.kind !== 'SITE' ||
        !parent.polygon ||
        !polygonInsidePolygon(polygon!, parent.polygon))
    ) {
      return failure('BOUNDARY_OUTSIDE_SITE');
    }
    if (
      input.kind === 'CONTAINER_CLUSTER_BAY' &&
      (parent?.kind !== 'ROOM_SUBSTRUCTURE' ||
        !parent.polygon ||
        !polygonInsidePolygon(polygon!, parent.polygon))
    ) {
      return failure('BOUNDARY_OUTSIDE_ROOM');
    }
    if (parent) {
      const ancestry = await this.getTrail(parent.id);
      if (ancestry.some((ancestor) => ancestor.lifecycle !== 'ACTIVE')) {
        return failure('PARENT_ARCHIVED');
      }
    }

    const timestamp = nowIso();
    const base = {
      id: createDomainId(),
      parentId: input.parentId,
      name,
      lifecycle: 'ACTIVE' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    let node: TopologyNode;

    switch (input.kind) {
      case 'NETWORK':
        node = { ...base, kind: 'NETWORK', parentId: null };
        break;
      case 'SITE':
        node = { ...base, kind: 'SITE', parentId: input.parentId as string, polygon: polygon! };
        break;
      case 'STRUCTURE':
        node = {
          ...base,
          kind: 'STRUCTURE',
          parentId: input.parentId as string,
          polygon: polygon!,
        };
        break;
      case 'LEVEL':
        node = { ...base, kind: 'LEVEL', parentId: input.parentId as string };
        break;
      case 'ROOM_SUBSTRUCTURE':
        if (!input.roomVariant) {
          return failure('INVALID_VARIANT');
        }
        node = {
          ...base,
          kind: 'ROOM_SUBSTRUCTURE',
          parentId: input.parentId as string,
          variant: input.roomVariant,
          polygon: polygon!,
        };
        break;
      case 'CONTAINER_CLUSTER_BAY':
        if (!input.clusterVariant) {
          return failure('INVALID_VARIANT');
        }
        node = {
          ...base,
          kind: 'CONTAINER_CLUSTER_BAY',
          parentId: input.parentId as string,
          variant: input.clusterVariant,
          polygon: polygon!,
        };
        break;
      case 'POSITION':
        if (
          !input.coordinate ||
          !input.coordinate.row.trim() ||
          input.coordinate.row.trim().length > 16 ||
          !Number.isInteger(input.coordinate.column) ||
          input.coordinate.column < 1
        ) {
          return failure('INVALID_COORDINATE');
        }
        node = {
          ...base,
          kind: 'POSITION',
          parentId: input.parentId as string,
          coordinate: {
            row: input.coordinate.row.trim().toUpperCase(),
            column: input.coordinate.column,
          },
        };
        break;
      case 'CONTAINER_RACK':
        if (!input.containerVariant) {
          return failure('INVALID_VARIANT');
        }
        if (
          input.containerVariant === 'RACK' &&
          (!Number.isInteger(input.totalU) ||
            (input.totalU ?? 0) < 1 ||
            (input.totalU ?? 0) > 1000)
        ) {
          return failure('INVALID_RACK_CAPACITY');
        }
        node = {
          ...base,
          kind: 'CONTAINER_RACK',
          parentId: input.parentId as string,
          variant: input.containerVariant,
          ...(input.totalU === undefined ? {} : { totalU: input.totalU }),
          cas: input.containerVariant === 'RACK' && input.totalU ? initializeCas(input.totalU) : [],
        };
        break;
      case 'DEVICE':
        node = {
          ...base,
          kind: 'DEVICE',
          parentId: input.parentId as string,
          pinned: false,
          deviceType: input.deviceType ?? 'CUSTOM',
          rootEquipmentIds: [],
          ...(input.serialNumber?.trim() ? { serialNumber: input.serialNumber.trim() } : {}),
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          ...(input.template ? { template: structuredClone(input.template) } : {}),
        };
        break;
      case 'EQUIPMENT': {
        if (!parent || (parent.kind !== 'DEVICE' && parent.kind !== 'EQUIPMENT')) {
          return failure('INVALID_PARENT');
        }

        const equipmentType = input.equipmentType ?? 'CUSTOM';
        if (
          parent.kind === 'EQUIPMENT' &&
          parent.template?.allowedChildTypes?.length &&
          !parent.template.allowedChildTypes.includes(equipmentType)
        ) {
          return failure('CHILD_TYPE_NOT_ALLOWED');
        }

        const childMode = input.childMode ?? 'DYNAMIC';
        let children: readonly (string | null)[];
        try {
          children = canonicalChildren(childMode, input.childCapacity);
        } catch {
          return failure('INVALID_CHILD_CAPACITY');
        }

        const deviceId = parent.kind === 'DEVICE' ? parent.id : parent.deviceId;
        const defaultAccessPorts: readonly AccessPort[] =
          equipmentType === 'CIRCUIT_BREAKER' && !input.accessPorts?.length
            ? [
                {
                  id: base.id + ':power-out',
                  deviceId,
                  equipmentId: base.id,
                  name: 'Power output',
                  portType: 'POWER',
                  direction: 'OUTPUT',
                  exposure: 'EXTERNAL',
                  lifecycle: 'ACTIVE',
                },
              ]
            : [];

        const equipment: EquipmentNode = {
          ...base,
          kind: 'EQUIPMENT',
          parentId: parent.id,
          deviceId,
          equipmentType,
          parentEquipmentId: parent.kind === 'EQUIPMENT' ? parent.id : null,
          childMode,
          children,
          accessPorts: structuredClone(input.accessPorts?.length ? input.accessPorts : defaultAccessPorts),
          pinned: false,
          ...(input.manufacturer?.trim() ? { manufacturer: input.manufacturer.trim() } : {}),
          ...(input.model?.trim() ? { model: input.model.trim() } : {}),
          ...(input.serialNumber?.trim() ? { serialNumber: input.serialNumber.trim() } : {}),
          ...(input.category?.trim() ? { category: input.category.trim() } : {}),
          ...(input.template ? { template: structuredClone(input.template) } : {}),
        };

        if (!this.repository.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');

        let updatedParent: DeviceNode | EquipmentNode;
        if (parent.kind === 'DEVICE') {
          updatedParent = {
            ...parent,
            rootEquipmentIds: [...parent.rootEquipmentIds, equipment.id],
            updatedAt: nowIso(),
          };
        } else if (parent.childMode === 'POSITIONAL') {
          if (!Number.isInteger(input.parentSlotIndex)) {
            return failure('POSITION_SLOT_REQUIRED');
          }
          const slot = input.parentSlotIndex as number;
          if (slot < 0 || slot >= parent.children.length) return failure('SLOT_OUT_OF_RANGE');
          if (parent.children[slot] !== null) return failure('SLOT_OCCUPIED');
          const nextChildren = [...parent.children];
          nextChildren[slot] = equipment.id;
          updatedParent = { ...parent, children: nextChildren, updatedAt: nowIso() };
        } else {
          updatedParent = {
            ...parent,
            children: [...parent.children, equipment.id],
            updatedAt: nowIso(),
          };
        }

        if (!(await this.repository.commitLayout([parent], [updatedParent, equipment]))) {
          return failure('LAYOUT_CONFLICT');
        }
        return success(equipment);
      }
    }

    if (node.kind === 'CONTAINER_CLUSTER_BAY' && parent) {
      if (!this.repository.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');
      const updatedAt = new Date(
        Math.max(Date.now(), Date.parse(parent.updatedAt) + 1),
      ).toISOString();
      if (!(await this.repository.commitLayout([parent], [{ ...parent, updatedAt }, node]))) {
        return failure('LAYOUT_CONFLICT');
      }
    } else {
      await this.repository.insert(node);
    }
    return success(node);
  }

  async configureEquipment(
    id: string,
    input: ConfigureEquipmentInput,
  ): Promise<Result<EquipmentNode, TopologyError>> {
    const node = await this.repository.getById(id);
    if (!node) return failure('NOT_FOUND');
    if (node.kind !== 'EQUIPMENT') return failure('NOT_EQUIPMENT');
    if (node.lifecycle !== 'ACTIVE') return failure('PARENT_ARCHIVED');

    const parent = await this.repository.getById(node.parentId);
    if (!parent || (parent.kind !== 'DEVICE' && parent.kind !== 'EQUIPMENT')) {
      return failure('INVALID_PARENT');
    }

    const equipmentType = input.equipmentType ?? node.equipmentType;
    if (
      parent.kind === 'EQUIPMENT' &&
      parent.template?.allowedChildTypes?.length &&
      !parent.template.allowedChildTypes.includes(equipmentType)
    ) {
      return failure('CHILD_TYPE_NOT_ALLOWED');
    }

    const childMode = input.childMode ?? node.childMode;
    const occupied = node.children.filter((childId): childId is string => childId !== null);
    let children: readonly (string | null)[];

    if (childMode === 'DYNAMIC') {
      children = occupied;
    } else {
      const requestedCapacity =
        input.childCapacity ?? (node.childMode === 'POSITIONAL' ? node.children.length : undefined);
      if (
        !Number.isInteger(requestedCapacity) ||
        (requestedCapacity ?? 0) < 1 ||
        (requestedCapacity ?? 0) > 256
      ) {
        return failure('INVALID_CHILD_CAPACITY');
      }

      const capacity = requestedCapacity as number;
      if (node.childMode === 'POSITIONAL') {
        const highestOccupied = node.children.reduce(
          (highest, childId, index) => (childId === null ? highest : Math.max(highest, index)),
          -1,
        );
        if (highestOccupied >= capacity) return failure('INVALID_CHILD_CAPACITY');
        children = Array.from(
          { length: capacity },
          (_, index) => node.children[index] ?? null,
        );
      } else {
        if (occupied.length > capacity) return failure('INVALID_CHILD_CAPACITY');
        children = Array.from(
          { length: capacity },
          (_, index) => occupied[index] ?? null,
        );
      }
    }

    if (!this.repository.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');
    const accessPorts =
      equipmentType === 'CIRCUIT_BREAKER' &&
      !node.accessPorts.some(
        (port) =>
          port.lifecycle === 'ACTIVE' &&
          port.portType === 'POWER' &&
          port.direction === 'OUTPUT',
      )
        ? [
            ...node.accessPorts,
            {
              id: node.id + ':power-out',
              deviceId: node.deviceId,
              equipmentId: node.id,
              name: 'Power output',
              portType: 'POWER' as const,
              direction: 'OUTPUT' as const,
              exposure: 'EXTERNAL' as const,
              lifecycle: 'ACTIVE' as const,
            },
          ]
        : node.accessPorts;

    const updated: EquipmentNode = {
      ...node,
      equipmentType,
      childMode,
      children,
      accessPorts,
      updatedAt: nowIso(),
    };
    if (!(await this.repository.commitLayout([node], [updated]))) {
      return failure('LAYOUT_CONFLICT');
    }
    return success(updated);
  }

  async move(
    id: string,
    newParentId: string,
    targetSlotIndex?: number,
  ): Promise<Result<TopologyNode, TopologyError>> {
    const node = await this.repository.getById(id);
    const parent = await this.repository.getById(newParentId);

    if (!node || !parent) return failure('NOT_FOUND');
    if (!['CONTAINER_RACK', 'DEVICE', 'EQUIPMENT'].includes(node.kind)) {
      return failure('MOVE_NOT_ALLOWED');
    }
    if (!isAllowedParent(node.kind, parent)) return failure('INVALID_PARENT');
    if (parent.lifecycle === 'ARCHIVED') return failure('PARENT_ARCHIVED');

    if (node.kind === 'CONTAINER_RACK' && (await this.hasActiveRack(parent.id, node.id))) {
      return failure('POSITION_OCCUPIED');
    }

    if (node.kind === 'DEVICE') {
      const physical = await this.repository.listEquipmentForDevice(node.id);
      if (physical.some((item) => item.lifecycle === 'ACTIVE' && item.rackPlacement)) {
        return failure('CAS_RELEASE_REQUIRED');
      }

      const moved = { ...node, parentId: parent.id, updatedAt: nowIso() } as TopologyNode;
      await this.repository.replace(moved);
      return success(moved);
    }

    if (node.kind === 'EQUIPMENT') {
      if (node.rackPlacement) return failure('CAS_RELEASE_REQUIRED');
      if (parent.kind !== 'DEVICE' && parent.kind !== 'EQUIPMENT') {
        return failure('INVALID_PARENT');
      }

      const targetDeviceId = parent.kind === 'DEVICE' ? parent.id : parent.deviceId;
      if (targetDeviceId !== node.deviceId) return failure('INVALID_DEVICE_OWNERSHIP');

      if (parent.kind === 'EQUIPMENT') {
        if (
          parent.template?.allowedChildTypes?.length &&
          !parent.template.allowedChildTypes.includes(node.equipmentType)
        ) {
          return failure('CHILD_TYPE_NOT_ALLOWED');
        }
        if (await this.isDescendant(node.id, parent.id)) return failure('EQUIPMENT_CYCLE');
      }

      const oldParent = await this.repository.getById(node.parentId);
      if (!oldParent || (oldParent.kind !== 'DEVICE' && oldParent.kind !== 'EQUIPMENT')) {
        return failure('INVALID_PARENT');
      }

      if (!this.repository.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');

      const timestamp = nowIso();
      const moved: EquipmentNode = {
        ...node,
        parentId: parent.id,
        parentEquipmentId: parent.kind === 'EQUIPMENT' ? parent.id : null,
        updatedAt: timestamp,
      };

      if (oldParent.id === parent.id) {
        if (parent.kind === 'DEVICE' || parent.childMode === 'DYNAMIC') {
          return success(node);
        }
        if (!Number.isInteger(targetSlotIndex)) return failure('POSITION_SLOT_REQUIRED');
        const slot = targetSlotIndex as number;
        if (slot < 0 || slot >= parent.children.length) return failure('SLOT_OUT_OF_RANGE');
        const currentSlot = parent.children.findIndex((candidate) => candidate === node.id);
        if (currentSlot < 0) return failure('INVALID_PARENT');
        if (slot === currentSlot) return success(node);
        if (parent.children[slot] !== null) return failure('SLOT_OCCUPIED');

        const nextChildren = [...parent.children];
        nextChildren[currentSlot] = null;
        nextChildren[slot] = node.id;
        const updatedParent: EquipmentNode = {
          ...parent,
          children: nextChildren,
          updatedAt: timestamp,
        };
        if (!(await this.repository.commitLayout([parent, node], [updatedParent, moved]))) {
          return failure('LAYOUT_CONFLICT');
        }
        return success(moved);
      }

      let updatedOldParent: DeviceNode | EquipmentNode;
      if (oldParent.kind === 'DEVICE') {
        updatedOldParent = {
          ...oldParent,
          rootEquipmentIds: oldParent.rootEquipmentIds.filter((candidate) => candidate !== node.id),
          updatedAt: timestamp,
        };
      } else {
        updatedOldParent = {
          ...oldParent,
          children: oldParent.children
            .map((candidate) => (candidate === node.id ? null : candidate))
            .filter((candidate) => (oldParent.childMode === 'DYNAMIC' ? candidate !== null : true)),
          updatedAt: timestamp,
        };
      }

      let updatedParent: DeviceNode | EquipmentNode;
      if (parent.kind === 'DEVICE') {
        updatedParent = {
          ...parent,
          rootEquipmentIds: parent.rootEquipmentIds.includes(node.id)
            ? parent.rootEquipmentIds
            : [...parent.rootEquipmentIds, node.id],
          updatedAt: timestamp,
        };
      } else if (parent.childMode === 'POSITIONAL') {
        if (!Number.isInteger(targetSlotIndex)) return failure('POSITION_SLOT_REQUIRED');
        const slot = targetSlotIndex as number;
        if (slot < 0 || slot >= parent.children.length) return failure('SLOT_OUT_OF_RANGE');
        if (parent.children[slot] !== null) return failure('SLOT_OCCUPIED');
        const nextChildren = [...parent.children];
        nextChildren[slot] = node.id;
        updatedParent = { ...parent, children: nextChildren, updatedAt: timestamp };
      } else {
        updatedParent = {
          ...parent,
          children: parent.children.includes(node.id)
            ? parent.children
            : [...parent.children, node.id],
          updatedAt: timestamp,
        };
      }

      if (
        !(await this.repository.commitLayout(
          [oldParent, parent, node],
          [updatedOldParent, updatedParent, moved],
        ))
      ) {
        return failure('LAYOUT_CONFLICT');
      }
      return success(moved);
    }

    const moved = { ...node, parentId: parent.id, updatedAt: nowIso() } as TopologyNode;
    await this.repository.replace(moved);
    return success(moved);
  }

  async archive(id: string): Promise<Result<TopologyNode, TopologyError>> {
    const node = await this.repository.getById(id);

    if (!node) {
      return failure('NOT_FOUND');
    }

    const children = await this.repository.listChildren(id);
    if (children.some((child) => child.lifecycle === 'ACTIVE')) {
      return failure('HAS_ACTIVE_CHILDREN');
    }

    if (node.kind === 'EQUIPMENT') {
      if (node.rackPlacement) return failure('CAS_RELEASE_REQUIRED');
      if (node.parentEquipmentId !== null) return failure('DETACH_REQUIRED');
    }

    const archived = {
      ...node,
      lifecycle: 'ARCHIVED' as const,
      updatedAt: nowIso(),
    };

    await this.repository.replace(archived);
    return success(archived);
  }

  async restore(id: string): Promise<Result<TopologyNode, TopologyError>> {
    const node = await this.repository.getById(id);

    if (!node) {
      return failure('NOT_FOUND');
    }

    if (node.parentId) {
      const parent = await this.repository.getById(node.parentId);
      if (!parent || parent.lifecycle !== 'ACTIVE') {
        return failure('PARENT_ARCHIVED_ON_RESTORE');
      }

      if (
        node.kind === 'EQUIPMENT' &&
        (parent.kind !== 'DEVICE' || node.parentEquipmentId !== null)
      ) {
        return failure('DETACH_REQUIRED');
      }
    }

    const restored = {
      ...node,
      lifecycle: 'ACTIVE' as const,
      updatedAt: nowIso(),
    };

    await this.repository.replace(restored);
    return success(restored);
  }

  async getTrail(id: string): Promise<readonly TopologyNode[]> {
    const reversed: TopologyNode[] = [];
    const visited = new Set<string>();
    let current = await this.repository.getById(id);

    while (current) {
      if (visited.has(current.id)) {
        throw new Error('Topology cycle detected.');
      }

      visited.add(current.id);
      reversed.push(current);

      if (!current.parentId) {
        break;
      }

      current = await this.repository.getById(current.parentId);
    }

    return reversed.reverse();
  }

  async buildDeepLink(id: string): Promise<string> {
    const trail = await this.getTrail(id);
    return `/topology/${trail.flatMap((node) => [topologySlug[node.kind], node.id]).join('/')}`;
  }

  async buildNavigationTree(rootId: string, maxDepth = 12): Promise<TopologyNavigationNode | null> {
    const trail = await this.getTrail(rootId);
    const root = trail.at(-1);

    if (!root || root.id !== rootId || root.lifecycle !== 'ACTIVE') return null;

    const canonicalPrefix = trail
      .slice(0, -1)
      .flatMap((node) => [topologySlug[node.kind], node.id]);

    const visit = async (
      node: TopologyNode,
      segments: readonly string[],
      depth: number,
    ): Promise<TopologyNavigationNode> => {
      const nextSegments = [...segments, topologySlug[node.kind], node.id];
      const children =
        depth >= maxDepth
          ? []
          : await Promise.all(
              (await this.listChildren(node.id)).map((child) =>
                visit(child, nextSegments, depth + 1),
              ),
            );

      return {
        node,
        href: `/topology/${nextSegments.join('/')}`,
        children,
      };
    };

    return visit(root, canonicalPrefix, 0);
  }

  async resolveDeepLink(segments: readonly string[]): Promise<Result<TopologyNode, TopologyError>> {
    if (segments.length < 2 || segments.length % 2 !== 0) {
      return failure('INVALID_DEEP_LINK');
    }

    let previousId: string | null = null;
    let current: TopologyNode | null = null;

    for (let index = 0; index < segments.length; index += 2) {
      const slug = segments[index];
      const id = segments[index + 1];

      if (!slug || !id) {
        return failure('INVALID_DEEP_LINK');
      }

      current = await this.repository.getById(id);

      if (!current || topologySlug[current.kind] !== slug || current.parentId !== previousId) {
        return failure('INVALID_DEEP_LINK');
      }

      previousId = current.id;
    }

    return current ? success(current) : failure('INVALID_DEEP_LINK');
  }

  private async isDescendant(rootId: string, candidateId: string): Promise<boolean> {
    let current = await this.repository.getById(candidateId);
    const visited = new Set<string>();

    while (current?.kind === 'EQUIPMENT') {
      if (current.id === rootId) return true;
      if (visited.has(current.id)) return true;
      visited.add(current.id);
      if (!current.parentEquipmentId) return false;
      current = await this.repository.getById(current.parentEquipmentId);
    }

    return false;
  }

  private async hasActiveRack(positionId: string, excludingId?: string): Promise<boolean> {
    const children = await this.repository.listChildren(positionId);

    return children.some(
      (node) =>
        node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE' && node.id !== excludingId,
    );
  }
}
