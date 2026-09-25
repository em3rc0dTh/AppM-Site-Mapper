import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  ContainerRackNode,
  PositionNode,
  RoomSubstructureNode,
} from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';
import { isValidPolygon, type PointMm, type RectMm } from '@/modules/spatial/domain/geometry';
import { generateAssignableSlots } from '@/modules/spatial/domain/placement';
import { gridCoordinateToPoint, TILE_SIZE_MM } from '@/modules/spatial/domain/grid';

export type SpatialError = 'ROOM_NOT_FOUND' | 'INVALID_POLYGON' | 'CONCURRENCY_CONFLICT';

export interface RackPlacementView {
  readonly id: string;
  readonly name: string;
  readonly rect: RectMm;
}

export interface RoomLayout {
  readonly room: RoomSubstructureNode;
  readonly racks: readonly RackPlacementView[];
  readonly assignableSlots: readonly RectMm[];
}

export class SpatialService {
  constructor(private readonly repository: TopologyRepository) {}

  async updateRoomPolygon(
    roomId: string,
    polygon: readonly PointMm[],
  ): Promise<Result<RoomSubstructureNode, SpatialError>> {
    const node = await this.repository.getById(roomId);

    if (!node || node.kind !== 'ROOM_SUBSTRUCTURE') {
      return failure('ROOM_NOT_FOUND');
    }

    if (!isValidPolygon(polygon)) {
      return failure('INVALID_POLYGON');
    }

    const expectedRevision = node.revision ?? 0;
    const updated: RoomSubstructureNode = {
      ...node,
      polygon,
      updatedAt: nowIso(),
      revision: expectedRevision + 1,
    };

    if (!(await this.repository.replace(updated, expectedRevision))) {
      return failure('CONCURRENCY_CONFLICT');
    }

    return success(updated);
  }

  async getRoomLayout(roomId: string): Promise<Result<RoomLayout, SpatialError>> {
    const node = await this.repository.getById(roomId);

    if (!node || node.kind !== 'ROOM_SUBSTRUCTURE') {
      return failure('ROOM_NOT_FOUND');
    }

    const clusters = (await this.repository.listChildren(roomId)).filter(
      (child) => child.kind === 'CONTAINER_CLUSTER_BAY' && child.lifecycle === 'ACTIVE',
    );

    const positions = (
      await Promise.all(clusters.map((cluster) => this.repository.listChildren(cluster.id)))
    )
      .flat()
      .filter(
        (child): child is PositionNode => child.kind === 'POSITION' && child.lifecycle === 'ACTIVE',
      );

    const racksByPosition = await Promise.all(
      positions.map(async (position) => {
        const racks = (await this.repository.listChildren(position.id)).filter(
          (child): child is ContainerRackNode =>
            child.kind === 'CONTAINER_RACK' && child.lifecycle === 'ACTIVE',
        );
        return { position, racks };
      }),
    );

    const racks = racksByPosition.flatMap(({ position, racks: positionRacks }) => {
      const point = gridCoordinateToPoint(position.coordinate);

      return positionRacks.map((rack) => ({
        id: rack.id,
        name: rack.name,
        rect: {
          x: point.x,
          y: point.y,
          width: rack.dimensionsMm?.width ?? TILE_SIZE_MM,
          depth: rack.dimensionsMm?.depth ?? TILE_SIZE_MM,
        },
      }));
    });

    const occupied = racks.map((rack) => rack.rect);
    const assignableSlots = node.polygon ? generateAssignableSlots(node.polygon, occupied) : [];

    return success({
      room: node,
      racks,
      assignableSlots,
    });
  }
}
