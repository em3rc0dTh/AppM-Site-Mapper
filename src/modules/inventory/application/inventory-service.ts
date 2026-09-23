import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import {
  isInventoryNode,
  toInventoryProfile,
  type InventoryProfile,
} from '@/modules/inventory/domain/occupant';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type InventoryError =
  | 'NOT_FOUND'
  | 'NOT_INVENTORY'
  | 'NOT_A_RACK'
  | 'INVALID_NAME'
  | 'INVALID_SERIAL'
  | 'INVALID_TYPE';

export interface UpdateInventoryInput {
  readonly name?: string;
  readonly serialNumber?: string | null;
  readonly category?: string | null;
  readonly type?: string | null;
  readonly pinned?: boolean;
}

export class InventoryService {
  constructor(private readonly repository: TopologyRepository) {}

  async get(id: string): Promise<Result<InventoryProfile, InventoryError>> {
    const node = await this.repository.getById(id);

    if (!node) {
      return failure('NOT_FOUND');
    }

    if (!isInventoryNode(node)) {
      return failure('NOT_INVENTORY');
    }

    return success(toInventoryProfile(node));
  }

  async listRackInventory(rackId: string): Promise<Result<readonly InventoryProfile[], InventoryError>> {
    const rack = await this.repository.getById(rackId);

    if (!rack || rack.kind !== 'CONTAINER_RACK' || rack.variant !== 'RACK') {
      return failure('NOT_A_RACK');
    }

    const children = await this.repository.listChildren(rackId);

    return success(
      children
        .filter(isInventoryNode)
        .filter((node) => node.lifecycle === 'ACTIVE')
        .map(toInventoryProfile),
    );
  }

  async update(
    id: string,
    input: UpdateInventoryInput,
  ): Promise<Result<InventoryProfile, InventoryError>> {
    const node = await this.repository.getById(id);

    if (!node) {
      return failure('NOT_FOUND');
    }

    if (!isInventoryNode(node)) {
      return failure('NOT_INVENTORY');
    }

    const nextName = input.name === undefined ? node.name : input.name.trim();

    if (!nextName) {
      return failure('INVALID_NAME');
    }

    const serialNumber = normalizeOptional(input.serialNumber, node.serialNumber);
    const category = normalizeOptional(input.category, node.category);
    const type = normalizeOptional(
      input.type,
      node.kind === 'DEVICE' ? node.deviceType : node.equipmentType,
    );

    if (serialNumber === 'INVALID') {
      return failure('INVALID_SERIAL');
    }

    if (type === 'INVALID') {
      return failure('INVALID_TYPE');
    }

    const common = {
      ...node,
      name: nextName,
      ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
      updatedAt: nowIso(),
    };

    let updated: DeviceNode | EquipmentNode;

    if (node.kind === 'DEVICE') {
      updated = {
        ...common,
        kind: 'DEVICE',
        ...replaceOptional('serialNumber', serialNumber),
        ...replaceOptional('category', category),
        ...replaceOptional('deviceType', type),
      } as DeviceNode;
    } else {
      updated = {
        ...common,
        kind: 'EQUIPMENT',
        ...replaceOptional('serialNumber', serialNumber),
        ...replaceOptional('category', category),
        ...replaceOptional('equipmentType', type),
      } as EquipmentNode;
    }

    await this.repository.replace(updated);
    return success(toInventoryProfile(updated));
  }
}

type Normalized = string | undefined | 'INVALID';

function normalizeOptional(
  requested: string | null | undefined,
  current: string | undefined,
): Normalized {
  if (requested === undefined) {
    return current;
  }

  if (requested === null) {
    return undefined;
  }

  const value = requested.trim();

  if (value.length > 160) {
    return 'INVALID';
  }

  return value || undefined;
}

function replaceOptional<K extends string>(
  key: K,
  value: Normalized,
): Partial<Record<K, string>> {
  return value && value !== 'INVALID' ? ({ [key]: value } as Record<K, string>) : {};
}
