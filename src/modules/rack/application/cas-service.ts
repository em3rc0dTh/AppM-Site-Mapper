import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { ContainerRackNode } from '@/modules/topology/domain/entities';
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
  | 'OCCUPANT_NOT_IN_RACK'
  | 'CONCURRENCY_CONFLICT';

export class CasService {
  constructor(private readonly repository: TopologyRepository) {}

  async reserve(
    rackId: string,
    input: ReserveCasInput,
  ): Promise<Result<ContainerRackNode, CasServiceError>> {
    const rack = await this.getRack(rackId);

    if (!rack.ok) {
      return rack;
    }

    const totalU = rack.value.totalU as number;
    const current = rack.value.cas.length > 0 ? rack.value.cas : initializeCas(totalU);
    const result = reserveCas(current, totalU, input);

    if (!result.ok) {
      return failure(result.error);
    }

    const expectedRevision = rack.value.revision ?? 0;
    const updated: ContainerRackNode = {
      ...rack.value,
      cas: result.ranges,
      updatedAt: nowIso(),
      revision: expectedRevision + 1,
    };

    if (!(await this.repository.replace(updated, expectedRevision))) {
      return failure('CONCURRENCY_CONFLICT');
    }

    return success(updated);
  }

  async equip(
    rackId: string,
    allocationId: string,
    occupantId: string,
  ): Promise<Result<ContainerRackNode, CasServiceError>> {
    const rack = await this.getRack(rackId);

    if (!rack.ok) {
      return rack;
    }

    const occupant = await this.repository.getById(occupantId);

    if (!occupant || !['DEVICE', 'EQUIPMENT'].includes(occupant.kind)) {
      return failure('OCCUPANT_NOT_FOUND');
    }

    if (occupant.parentId !== rack.value.id || occupant.lifecycle !== 'ACTIVE') {
      return failure('OCCUPANT_NOT_IN_RACK');
    }

    const result = equipCas(rack.value.cas, rack.value.totalU as number, allocationId, occupant.id);

    if (!result.ok) {
      return failure(result.error);
    }

    const expectedRevision = rack.value.revision ?? 0;
    const updated: ContainerRackNode = {
      ...rack.value,
      cas: result.ranges,
      updatedAt: nowIso(),
      revision: expectedRevision + 1,
    };

    if (!(await this.repository.replace(updated, expectedRevision))) {
      return failure('CONCURRENCY_CONFLICT');
    }

    return success(updated);
  }

  async free(
    rackId: string,
    allocationId: string,
  ): Promise<Result<ContainerRackNode, CasServiceError>> {
    const rack = await this.getRack(rackId);

    if (!rack.ok) {
      return rack;
    }

    const result = freeCas(rack.value.cas, rack.value.totalU as number, allocationId);

    if (!result.ok) {
      return failure(result.error);
    }

    const expectedRevision = rack.value.revision ?? 0;
    const updated: ContainerRackNode = {
      ...rack.value,
      cas: result.ranges,
      updatedAt: nowIso(),
      revision: expectedRevision + 1,
    };

    if (!(await this.repository.replace(updated, expectedRevision))) {
      return failure('CONCURRENCY_CONFLICT');
    }

    return success(updated);
  }

  private async getRack(rackId: string): Promise<Result<ContainerRackNode, CasServiceError>> {
    const node = await this.repository.getById(rackId);

    if (!node) {
      return failure('RACK_NOT_FOUND');
    }

    if (node.kind !== 'CONTAINER_RACK' || node.variant !== 'RACK' || !node.totalU) {
      return failure('NOT_A_RACK');
    }

    return success(node);
  }
}
