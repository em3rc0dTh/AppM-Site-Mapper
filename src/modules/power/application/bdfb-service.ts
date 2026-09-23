import { validateBdfb, type BdfbValidationError } from '@/modules/power/domain/bdfb-validation';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { BdfbStructure, DeviceNode } from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type BdfbError =
  BdfbValidationError | 'DEVICE_NOT_FOUND' | 'NOT_A_DEVICE' | 'DEVICE_ARCHIVED';

export class BdfbService {
  constructor(private readonly topology: TopologyRepository) {}

  async configure(
    deviceId: string,
    structure: BdfbStructure,
  ): Promise<Result<DeviceNode, BdfbError>> {
    const node = await this.topology.getById(deviceId);

    if (!node) {
      return failure('DEVICE_NOT_FOUND');
    }

    if (node.kind !== 'DEVICE') {
      return failure('NOT_A_DEVICE');
    }

    if (node.lifecycle !== 'ACTIVE') {
      return failure('DEVICE_ARCHIVED');
    }

    const validation = validateBdfb(structure);

    if (!validation.ok) {
      return failure(validation.error);
    }

    const updated: DeviceNode = {
      ...node,
      deviceType: 'BDFB',
      bdfb: structuredClone(structure),
      updatedAt: nowIso(),
    };

    await this.topology.replace(updated);
    return success(updated);
  }
}
