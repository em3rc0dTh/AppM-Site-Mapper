import { BdfbService } from '@/modules/power/application/bdfb-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import { materializeBdfbBlueprint, snapshotTemplate } from '@/modules/warehouse/domain/template';
import { failure, success, type Result } from '@/shared/domain/result';

export type WarehouseInstantiationError =
  'TEMPLATE_NOT_FOUND' | 'RACK_NOT_FOUND' | 'INVALID_NAME' | 'CREATE_FAILED';

export interface InstantiateTemplateInput {
  readonly templateId: string;
  readonly rackId: string;
  readonly name: string;
  readonly serialNumber?: string;
  readonly category?: string;
}

export interface InstantiatedAsset {
  readonly node: DeviceNode | EquipmentNode;
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
    if (!input.name.trim()) return failure('INVALID_NAME');

    const template = await this.warehouse.getById(input.templateId);
    if (!template || template.lifecycle !== 'ACTIVE') return failure('TEMPLATE_NOT_FOUND');

    const topology = new TopologyService(this.topologyRepository);
    const rack = await topology.getById(input.rackId);
    if (
      !rack ||
      rack.kind !== 'CONTAINER_RACK' ||
      rack.variant !== 'RACK' ||
      rack.lifecycle !== 'ACTIVE'
    )
      return failure('RACK_NOT_FOUND');

    const created = await topology.create({
      kind: template.kind,
      parentId: rack.id,
      name: input.name,
      ...(input.serialNumber ? { serialNumber: input.serialNumber } : {}),
      ...(input.category?.trim()
        ? { category: input.category }
        : template.category
          ? { category: template.category }
          : {}),
      template: snapshotTemplate(template),
    });

    if (!created.ok || (created.value.kind !== 'DEVICE' && created.value.kind !== 'EQUIPMENT'))
      return failure('CREATE_FAILED');

    let node = created.value;
    if (
      template.kind === 'DEVICE' &&
      template.deviceType === 'BDFB' &&
      template.physicalBlueprint?.type === 'BDFB'
    ) {
      if (node.kind !== 'DEVICE') return failure('CREATE_FAILED');
      const configured = await new BdfbService(this.topologyRepository).configure(
        node.id,
        materializeBdfbBlueprint(template.physicalBlueprint, node.id),
      );
      if (!configured.ok) return failure('CREATE_FAILED');
      node = configured.value;
    }

    return success({
      node,
      recommendedMountSizeU: template.sizeU ?? null,
      state: 'UNMOUNTED',
    });
  }
}
