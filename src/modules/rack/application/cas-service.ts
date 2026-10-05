import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { ContainerRackNode, EquipmentNode } from '@/modules/topology/domain/entities';
import {
  equipCas,
  freeCas,
  initializeCas,
  reserveCas,
  type CasError,
  type ReserveCasInput,
} from '@/modules/rack/domain/cas';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type CasServiceError =
  | CasError
  | 'RACK_NOT_FOUND'
  | 'NOT_A_RACK'
  | 'OCCUPANT_NOT_FOUND'
  | 'OCCUPANT_NOT_EQUIPMENT'
  | 'EQUIPMENT_ALREADY_PLACED'
  | 'RANGE_NOT_RESERVED';

export class CasService {
  constructor(private readonly repository: TopologyRepository) {}

  async reserve(
    rackId: string,
    input: ReserveCasInput,
  ): Promise<Result<ContainerRackNode, CasServiceError>> {
    const rack = await this.getRack(rackId);
    if (!rack.ok) return rack;

    const totalU = rack.value.totalU as number;
    const current = rack.value.cas.length > 0 ? rack.value.cas : initializeCas(totalU);
    const result = reserveCas(current, totalU, input);
    if (!result.ok) return failure(result.error);

    const updated: ContainerRackNode = { ...rack.value, cas: result.ranges, updatedAt: nowIso() };
    await this.repository.replace(updated);
    return success(updated);
  }

  async equip(
    rackId: string,
    allocationId: string,
    occupantId: string,
  ): Promise<Result<ContainerRackNode, CasServiceError>> {
    const rack = await this.getRack(rackId);
    if (!rack.ok) return rack;

    const occupant = await this.repository.getById(occupantId);
    if (!occupant) return failure('OCCUPANT_NOT_FOUND');
    if (occupant.kind !== 'EQUIPMENT' || occupant.lifecycle !== 'ACTIVE') {
      return failure('OCCUPANT_NOT_EQUIPMENT');
    }
    if (occupant.rackPlacement && occupant.rackPlacement.rackId !== rack.value.id) {
      return failure('EQUIPMENT_ALREADY_PLACED');
    }

    const allocation = rack.value.cas.find((range) => range.id === allocationId);
    if (!allocation || allocation.state !== 'RESERVED') return failure('RANGE_NOT_RESERVED');

    const result = equipCas(rack.value.cas, rack.value.totalU as number, allocationId, occupant.id);
    if (!result.ok) return failure(result.error);

    const placement = {
      rackId: rack.value.id,
      mode: 'U_RANGE' as const,
      startU: allocation.mountStartU ?? allocation.startU,
      sizeU: allocation.physicalSizeU ?? allocation.endU - allocation.startU + 1,
      ...(allocation.clearanceTopU === undefined
        ? {}
        : { clearanceTopU: allocation.clearanceTopU }),
      ...(allocation.clearanceBottomU === undefined
        ? {}
        : { clearanceBottomU: allocation.clearanceBottomU }),
    };

    const updatedRack: ContainerRackNode = {
      ...rack.value,
      cas: result.ranges,
      updatedAt: nowIso(),
    };
    const updatedEquipment: EquipmentNode = {
      ...occupant,
      rackPlacement: placement,
      updatedAt: nowIso(),
    };

    await this.repository.replace(updatedRack);
    await this.repository.replace(updatedEquipment);
    return success(updatedRack);
  }

  async free(
    rackId: string,
    allocationId: string,
  ): Promise<Result<ContainerRackNode, CasServiceError>> {
    const rack = await this.getRack(rackId);
    if (!rack.ok) return rack;

    const allocation = rack.value.cas.find((range) => range.id === allocationId);
    const occupantId = allocation?.state === 'EQUIPPED' ? allocation.occupantId : undefined;
    const result = freeCas(rack.value.cas, rack.value.totalU as number, allocationId);
    if (!result.ok) return failure(result.error);

    const updated: ContainerRackNode = { ...rack.value, cas: result.ranges, updatedAt: nowIso() };
    await this.repository.replace(updated);

    if (occupantId) {
      const occupant = await this.repository.getById(occupantId);
      if (occupant?.kind === 'EQUIPMENT' && occupant.rackPlacement?.rackId === rack.value.id) {
        const { rackPlacement: _placement, ...rest } = occupant;
        await this.repository.replace({ ...rest, updatedAt: nowIso() } as EquipmentNode);
      }
    }

    return success(updated);
  }

  private async getRack(rackId: string): Promise<Result<ContainerRackNode, CasServiceError>> {
    const node = await this.repository.getById(rackId);
    if (!node) return failure('RACK_NOT_FOUND');
    if (node.kind !== 'CONTAINER_RACK' || node.variant !== 'RACK' || !node.totalU) {
      return failure('NOT_A_RACK');
    }
    return success(node);
  }
}
