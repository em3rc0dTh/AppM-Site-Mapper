import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  DeviceNode,
  DeviceType,
  EquipmentNode,
} from '@/modules/topology/domain/entities';
import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import { snapshotTemplate } from '@/modules/warehouse/domain/template';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type WarehouseInstantiationError =
  | 'TEMPLATE_NOT_FOUND'
  | 'INVALID_TEMPLATE_KIND'
  | 'RACK_NOT_FOUND'
  | 'INVALID_NAME'
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
}

export interface InstantiatedAsset {
  readonly device: DeviceNode;
  readonly equipment: EquipmentNode;
  readonly recommendedMountSizeU: number | null;
  readonly state: 'UNMOUNTED';
}

export class WarehouseInstantiationService {
  constructor(
    private readonly warehouse: WarehouseRepository,
    private readonly topologyRepository: TopologyRepository,
  ) {}

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

    const serialNumber = input.serialNumber?.trim();
    if (serialNumber) {
      const [devices, equipment] = await Promise.all([
        this.topologyRepository.listByKind('DEVICE'),
        this.topologyRepository.listByKind('EQUIPMENT'),
      ]);
      if (
        [...devices, ...equipment].some(
          (node) =>
            node.lifecycle === 'ACTIVE' &&
            (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') &&
            node.serialNumber === serialNumber,
        )
      ) {
        return failure('SERIAL_ALREADY_ASSIGNED');
      }
    }

    if (!this.topologyRepository.commitLayout) return failure('ATOMIC_CREATE_REQUIRED');

    const timestamp = nowIso();
    const deviceId = createDomainId();
    const equipmentId = createDomainId();
    const category = input.category?.trim() || template.category;

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
      equipmentType: 'CUSTOM',
      parentEquipmentId: null,
      childMode: 'DYNAMIC',
      children: [],
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
}
