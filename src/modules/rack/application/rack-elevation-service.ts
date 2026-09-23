import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { isInventoryNode } from '@/modules/inventory/domain/occupant';
import {
  projectRackElevation,
  type RackElevationOccupant,
  type RackElevationProjection,
} from '@/modules/rack/domain/elevation';
import { failure, success, type Result } from '@/shared/domain/result';

export type RackElevationError = 'RACK_NOT_FOUND' | 'NOT_A_RACK' | 'INVALID_CAS_OCCUPANT';

export class RackElevationService {
  constructor(private readonly repository: TopologyRepository) {}

  async get(rackId: string): Promise<Result<RackElevationProjection, RackElevationError>> {
    const rack = await this.repository.getById(rackId);

    if (!rack) {
      return failure('RACK_NOT_FOUND');
    }

    if (rack.kind !== 'CONTAINER_RACK' || rack.variant !== 'RACK' || !rack.totalU) {
      return failure('NOT_A_RACK');
    }

    const children = await this.repository.listChildren(rackId);
    const inventory = children.filter(isInventoryNode);
    const occupants = new Map<string, RackElevationOccupant>(
      inventory.map((node) => [
        node.id,
        {
          id: node.id,
          kind: node.kind,
          name: node.name,
        },
      ]),
    );

    for (const range of rack.cas) {
      if (range.state === 'EQUIPPED' && (!range.occupantId || !occupants.has(range.occupantId))) {
        return failure('INVALID_CAS_OCCUPANT');
      }
    }

    return success(projectRackElevation(rack.id, rack.name, rack.totalU, rack.cas, occupants));
  }
}
