import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DimensionsMm, PositionNode } from '@/modules/topology/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

import { rectsOverlap } from '../domain/geometry';
import {
  resolveRackFootprint,
  type RackFootprintError,
} from '../domain/rack-footprint';
import { TILE_SIZE_MM } from '../domain/grid';
import { SpatialService } from './spatial-service';

export type RackPlacementError =
  | RackFootprintError
  | 'RACK_CLUSTER_RUN_REQUIRED'
  | 'RACK_ROOM_BOUNDARY_REQUIRED'
  | 'RACK_FOOTPRINT_COLLISION'
  | 'INVALID_PARENT';

export interface RackPlacementValidation {
  readonly rect: Readonly<{ x: number; y: number; width: number; depth: number }>;
  readonly coveredPositionIds: readonly string[];
}

export class RackPlacementService {
  constructor(private readonly repository: TopologyRepository) {}

  async validate(
    positionId: string,
    dimensions: DimensionsMm = { width: TILE_SIZE_MM, depth: TILE_SIZE_MM },
    excludingRackId?: string,
  ): Promise<Result<RackPlacementValidation, RackPlacementError>> {
    const position = await this.repository.getById(positionId);

    if (!position || position.kind !== 'POSITION' || position.lifecycle !== 'ACTIVE') {
      return failure('INVALID_PARENT');
    }

    const cluster = await this.repository.getById(position.parentId);

    if (
      !cluster ||
      cluster.kind !== 'CONTAINER_CLUSTER_BAY' ||
      cluster.lifecycle !== 'ACTIVE' ||
      !cluster.run
    ) {
      return failure('RACK_CLUSTER_RUN_REQUIRED');
    }

    const room = await this.repository.getById(cluster.parentId);

    if (
      !room ||
      room.kind !== 'ROOM_SUBSTRUCTURE' ||
      room.lifecycle !== 'ACTIVE' ||
      !room.polygon ||
      room.polygon.length < 3
    ) {
      return failure('RACK_ROOM_BOUNDARY_REQUIRED');
    }

    const footprint = resolveRackFootprint(position.coordinate, cluster.run, dimensions, room.polygon);

    if (!footprint.ok) {
      return failure(footprint.error);
    }

    const layout = await new SpatialService(this.repository).getRoomLayout(room.id);

    if (!layout.ok) {
      return failure('RACK_ROOM_BOUNDARY_REQUIRED');
    }

    if (
      layout.value.racks.some(
        (rack) => rack.id !== excludingRackId && rectsOverlap(footprint.rect, rack.rect),
      )
    ) {
      return failure('RACK_FOOTPRINT_COLLISION');
    }

    const clusterPositions = (await this.repository.listChildren(cluster.id)).filter(
      (candidate): candidate is PositionNode =>
        candidate.kind === 'POSITION' && candidate.lifecycle === 'ACTIVE',
    );
    const coveredKeys = new Set(
      footprint.coveredCoordinates.map(
        (coordinate) => `${coordinate.row.toUpperCase()}-${coordinate.column}`,
      ),
    );

    return success({
      rect: footprint.rect,
      coveredPositionIds: clusterPositions
        .filter((candidate) =>
          coveredKeys.has(
            `${candidate.coordinate.row.toUpperCase()}-${candidate.coordinate.column}`,
          ),
        )
        .map((candidate) => candidate.id),
    });
  }
}
