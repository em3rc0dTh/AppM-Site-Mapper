import {
  TopologyService,
  type TopologyError,
} from '@/modules/topology/application/topology-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  DeviceNode,
  DeviceType,
  EquipmentChildMode,
  EquipmentNode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import { snapshotTemplate, type AssetTemplate } from '@/modules/warehouse/domain/template';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type WarehouseInstantiationError =
  | TopologyError
  | 'TEMPLATE_NOT_FOUND'
  | 'INVALID_TEMPLATE_KIND'
  | 'RACK_NOT_FOUND'
  | 'PARENT_EQUIPMENT_NOT_FOUND'
  | 'INVALID_NAME'
  | 'INVALID_CHILD_CAPACITY'
  | 'SERIAL_ALREADY_ASSIGNED'
  | 'ATOMIC_CREATE_REQUIRED'
  | 'CREATE_FAILED';

export interface InstantiateTemplateInput {
  readonly templateId: string;
  readonly rackId: string;
  /** Operational Device identity created in Topology. */
  readonly name: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly deviceType?: DeviceType;
  /** Optional instance override for legacy/simple Warehouse templates. */
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  readonly childCapacity?: number;
}

export interface InstantiateChildEquipmentInput {
  readonly templateId: string;
  readonly parentEquipmentId: string;
  readonly slotIndex?: number;
  readonly name?: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  readonly childCapacity?: number;
}

export interface InstantiatedAsset {
  readonly device: DeviceNode;
  readonly equipment: EquipmentNode;
  readonly recommendedMountSizeU: number | null;
  readonly state: 'UNMOUNTED';
}

type ResolvedComposition =
  | { readonly childMode: 'DYNAMIC' }
  | { readonly childMode: 'POSITIONAL'; readonly childCapacity: number };

function resolvedComposition(
  template: AssetTemplate,
  childModeOverride?: EquipmentChildMode,
  childCapacityOverride?: number,
): ResolvedComposition | null {
  const childMode = childModeOverride ?? template.childMode ?? 'DYNAMIC';
  const childCapacity = childCapacityOverride ?? template.childCapacity;

  if (childMode === 'POSITIONAL') {
    if (
      !Number.isInteger(childCapacity) ||
      (childCapacity ?? 0) < 1 ||
      (childCapacity ?? 0) > 256
    ) {
      return null;
    }
    return { childMode, childCapacity: childCapacity as number };
  }

  return { childMode };
}

export class WarehouseInstantiationService {
  constructor(
    private readonly warehouse: WarehouseRepository,
    private readonly topologyRepository: TopologyRepository,
  ) {}

  private async serialAlreadyAssigned(serialNumber: string | undefined): Promise<boolean> {
    const serial = serialNumber?.trim();
    if (!serial) return false;

    const [devices, equipment] = await Promise.all([
      this.topologyRepository.listByKind('DEVICE'),
      this.topologyRepository.listByKind('EQUIPMENT'),
    ]);

    return [...devices, ...equipment].some(
      (node) =>
        node.lifecycle === 'ACTIVE' &&
        (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') &&
        node.serialNumber === serial,
    );
  }

  async instantiate(
    input: InstantiateTemplateInput,
  ): Promise<Result<InstantiatedAsset, WarehouseInstantiationError>> {
    const name = input.name.trim();
    if (!name) return failure('INVALID_NAME');

    const template = await this.warehouse.getById(input.templateId);
    if (!template || template.lifecycle !== 'ACTIVE') return failure('TEMPLATE_NOT_FOUND');
    if (template.kind !== 'EQUIPMENT') return failure('INVALID_TEMPLATE_KIND');

    const rack = await this.topologyRepository.getById(input.rackId);
    if (
      !rack ||
      rack.kind !== 'CONTAINER_RACK' ||
      rack.variant !== 'RACK' ||
      rack.lifecycle !== 'ACTIVE'
    ) {
      return failure('RACK_NOT_FOUND');
    }

    if (await this.serialAlreadyAssigned(input.serialNumber)) {
      return failure('SERIAL_ALREADY_ASSIGNED');
    }

    const composition = resolvedComposition(template, input.childMode, input.childCapacity);
    if (!composition) return failure('INVALID_CHILD_CAPACITY');
    if (!this.topologyRepository.commitLayout) return failure('ATOMIC_CREATE_REQUIRED');

    const timestamp = nowIso();
    const deviceId = createDomainId();
    const equipmentId = createDomainId();
    const category = input.category?.trim() || template.category;
    const serialNumber = input.serialNumber?.trim();
    const device: DeviceNode = {
      id: deviceId,
      parentId: rack.id,
      name,
      kind: 'DEVICE',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      pinned: false,
      deviceType: input.deviceType ?? 'CUSTOM',
      rootEquipmentIds: [equipmentId],
      ...(serialNumber ? { serialNumber } : {}),
      ...(category ? { category } : {}),
    };

    const equipment: EquipmentNode = {
      id: equipmentId,
      parentId: device.id,
      name: `${name} · ${template.name}`,
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      deviceId: device.id,
      equipmentType: input.equipmentType ?? template.equipmentType ?? 'CUSTOM',
      parentEquipmentId: null,
      childMode: composition.childMode,
      children:
        composition.childMode === 'POSITIONAL'
          ? Array.from({ length: composition.childCapacity! }, () => null)
          : [],
      accessPorts: [],
      pinned: false,
      ...(category ? { category } : {}),
      ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
      ...(template.model ? { model: template.model } : {}),
      template: snapshotTemplate(template),
    };

    try {
      const committed = await this.topologyRepository.commitLayout([], [device, equipment]);
      if (!committed) return failure('CREATE_FAILED');
    } catch {
      return failure('CREATE_FAILED');
    }

    return success({
      device,
      equipment,
      recommendedMountSizeU: template.sizeU ?? null,
      state: 'UNMOUNTED',
    });
  }

  async instantiateChild(
    input: InstantiateChildEquipmentInput,
  ): Promise<Result<EquipmentNode, WarehouseInstantiationError>> {
    const template = await this.warehouse.getById(input.templateId);
    if (!template || template.lifecycle !== 'ACTIVE') return failure('TEMPLATE_NOT_FOUND');
    if (template.kind !== 'EQUIPMENT') return failure('INVALID_TEMPLATE_KIND');

    const parent = await this.topologyRepository.getById(input.parentEquipmentId);
    if (!parent || parent.kind !== 'EQUIPMENT' || parent.lifecycle !== 'ACTIVE') {
      return failure('PARENT_EQUIPMENT_NOT_FOUND');
    }

    if (await this.serialAlreadyAssigned(input.serialNumber)) {
      return failure('SERIAL_ALREADY_ASSIGNED');
    }

    const composition = resolvedComposition(template, input.childMode, input.childCapacity);
    if (!composition) return failure('INVALID_CHILD_CAPACITY');

    const result = await new TopologyService(this.topologyRepository).create({
      kind: 'EQUIPMENT',
      parentId: parent.id,
      name: input.name?.trim() || template.name,
      ...(input.slotIndex === undefined ? {} : { parentSlotIndex: input.slotIndex }),
      equipmentType: input.equipmentType ?? template.equipmentType ?? 'CUSTOM',
      childMode: composition.childMode,
      ...(composition.childMode === 'POSITIONAL'
        ? { childCapacity: composition.childCapacity }
        : {}),
      ...(input.serialNumber?.trim() ? { serialNumber: input.serialNumber.trim() } : {}),
      ...(input.category?.trim() || template.category
        ? { category: input.category?.trim() || template.category }
        : {}),
      ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
      ...(template.model ? { model: template.model } : {}),
      template: snapshotTemplate(template),
    });

    if (!result.ok) return failure(result.error);
    if (result.value.kind !== 'EQUIPMENT') return failure('CREATE_FAILED');
    return success(result.value);
  }
}
