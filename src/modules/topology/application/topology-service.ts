import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  ContainerClusterBayVariant,
  ContainerRackVariant,
  DimensionsMm,
  GridCoordinate,
  RoomSubstructureVariant,
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';
import { isAllowedParent, topologySlug } from '@/modules/topology/domain/hierarchy';
import { initializeCas } from '@/modules/rack/domain/cas';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type TopologyError =
  | 'NOT_FOUND'
  | 'INVALID_NAME'
  | 'INVALID_PARENT'
  | 'PARENT_ARCHIVED'
  | 'POSITION_OCCUPIED'
  | 'INVALID_VARIANT'
  | 'INVALID_COORDINATE'
  | 'INVALID_RACK_CAPACITY'
  | 'INVALID_DIMENSIONS'
  | 'MOVE_NOT_ALLOWED'
  | 'HAS_ACTIVE_CHILDREN'
  | 'CAS_RELEASE_REQUIRED'
  | 'PARENT_ARCHIVED_ON_RESTORE'
  | 'INVALID_DEEP_LINK';

export interface CreateTopologyNodeInput {
  readonly kind: TopologyKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly roomVariant?: RoomSubstructureVariant;
  readonly clusterVariant?: ContainerClusterBayVariant;
  readonly containerVariant?: ContainerRackVariant;
  readonly coordinate?: GridCoordinate;
  readonly totalU?: number;
  readonly dimensionsMm?: DimensionsMm;
  readonly serialNumber?: string;
  readonly category?: string;
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

    if (!name) {
      return failure('INVALID_NAME');
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
        node = { ...base, kind: 'SITE', parentId: input.parentId as string };
        break;
      case 'STRUCTURE':
        node = { ...base, kind: 'STRUCTURE', parentId: input.parentId as string };
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
        };
        break;
      case 'POSITION':
        if (
          !input.coordinate ||
          !input.coordinate.row.trim() ||
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
          (!Number.isInteger(input.totalU) || (input.totalU ?? 0) < 1)
        ) {
          return failure('INVALID_RACK_CAPACITY');
        }
        if (
          input.dimensionsMm &&
          (!Number.isFinite(input.dimensionsMm.width) ||
            !Number.isFinite(input.dimensionsMm.depth) ||
            input.dimensionsMm.width <= 0 ||
            input.dimensionsMm.depth <= 0)
        ) {
          return failure('INVALID_DIMENSIONS');
        }
        node = {
          ...base,
          kind: 'CONTAINER_RACK',
          parentId: input.parentId as string,
          variant: input.containerVariant,
          ...(input.totalU === undefined ? {} : { totalU: input.totalU }),
          ...(input.dimensionsMm ? { dimensionsMm: input.dimensionsMm } : {}),
          cas: input.containerVariant === 'RACK' && input.totalU ? initializeCas(input.totalU) : [],
        };
        break;
      case 'DEVICE':
        node = {
          ...base,
          kind: 'DEVICE',
          parentId: input.parentId as string,
          pinned: false,
          ...(input.serialNumber ? { serialNumber: input.serialNumber.trim() } : {}),
          ...(input.category ? { category: input.category.trim() } : {}),
        };
        break;
      case 'EQUIPMENT':
        node = {
          ...base,
          kind: 'EQUIPMENT',
          parentId: input.parentId as string,
          pinned: false,
          ...(input.serialNumber ? { serialNumber: input.serialNumber.trim() } : {}),
          ...(input.category ? { category: input.category.trim() } : {}),
        };
        break;
    }

    await this.repository.insert(node);
    return success(node);
  }

  async move(id: string, newParentId: string): Promise<Result<TopologyNode, TopologyError>> {
    const node = await this.repository.getById(id);
    const parent = await this.repository.getById(newParentId);

    if (!node || !parent) {
      return failure('NOT_FOUND');
    }

    if (!['CONTAINER_RACK', 'DEVICE', 'EQUIPMENT'].includes(node.kind)) {
      return failure('MOVE_NOT_ALLOWED');
    }

    if (!isAllowedParent(node.kind, parent)) {
      return failure('INVALID_PARENT');
    }

    if (parent.lifecycle === 'ARCHIVED') {
      return failure('PARENT_ARCHIVED');
    }

    if (node.kind === 'CONTAINER_RACK' && (await this.hasActiveRack(parent.id, node.id))) {
      return failure('POSITION_OCCUPIED');
    }

    if (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') {
      const currentParent = node.parentId ? await this.repository.getById(node.parentId) : null;

      if (
        currentParent?.kind === 'CONTAINER_RACK' &&
        currentParent.cas.some(
          (range) => range.state === 'EQUIPPED' && range.occupantId === node.id,
        )
      ) {
        return failure('CAS_RELEASE_REQUIRED');
      }
    }

    const moved = {
      ...node,
      parentId: parent.id,
      updatedAt: nowIso(),
    } as TopologyNode;

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

  private async hasActiveRack(positionId: string, excludingId?: string): Promise<boolean> {
    const children = await this.repository.listChildren(positionId);

    return children.some(
      (node) =>
        node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE' && node.id !== excludingId,
    );
  }
}
