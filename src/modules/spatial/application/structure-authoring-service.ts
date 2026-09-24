import { SpatialService, type SpatialError } from '@/modules/spatial/application/spatial-service';
import {
  TopologyService,
  type TopologyError,
} from '@/modules/topology/application/topology-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { StructureNode } from '@/modules/topology/domain/entities';
import {
  isValidPolygon,
  polygonContainedByPolygon,
  type PointMm,
} from '@/modules/spatial/domain/geometry';
import { failure, success, type Result } from '@/shared/domain/result';

export interface CreateStructureAuthoringInput {
  readonly parentId: string;
  readonly name: string;
  readonly polygon?: readonly PointMm[];
}

export type StructureAuthoringError = TopologyError | SpatialError;

export class StructureAuthoringService {
  constructor(private readonly repository: TopologyRepository) {}

  async create(
    input: CreateStructureAuthoringInput,
  ): Promise<Result<StructureNode, StructureAuthoringError>> {
    if (input.polygon && !isValidPolygon(input.polygon)) {
      return failure('INVALID_POLYGON');
    }

    if (input.polygon) {
      const parent = await this.repository.getById(input.parentId);

      if (
        parent?.kind === 'SITE' &&
        parent.polygon &&
        !polygonContainedByPolygon(input.polygon, parent.polygon)
      ) {
        return failure('BOUNDARY_OUTSIDE_PARENT');
      }
    }

    const topology = new TopologyService(this.repository);
    const created = await topology.create({
      kind: 'STRUCTURE',
      parentId: input.parentId,
      name: input.name,
    });

    if (!created.ok) {
      return created;
    }

    if (created.value.kind !== 'STRUCTURE') {
      return failure('INVALID_PARENT');
    }

    if (!input.polygon) {
      return success(created.value);
    }

    const spatial = await new SpatialService(this.repository).updateBoundary(
      created.value.id,
      input.polygon,
    );

    if (!spatial.ok) {
      await topology.archive(created.value.id);
      return spatial;
    }

    return success(spatial.value as StructureNode);
  }
}
