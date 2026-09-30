import { prepareLayoutSave, readLayoutDraft } from './layout-editor-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  ContainerClusterBayNode,
  ContainerRackNode,
  PositionNode,
  RoomSubstructureNode,
} from '@/modules/topology/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';
import { type PointMm, type RectMm } from '@/modules/spatial/domain/geometry';
import { generateAssignableSlots } from '@/modules/spatial/domain/placement';
import { gridCoordinateToPoint, TILE_SIZE_MM } from '@/modules/spatial/domain/grid';

export type SpatialError = string;

export interface RackPlacementView {
  readonly id: string;
  readonly name: string;
  readonly rect: RectMm;
}

export interface ClusterPlacementView {
  readonly id: string;
  readonly name: string;
  readonly polygon?: readonly PointMm[];
}

export interface RoomLayout {
  readonly room: RoomSubstructureNode;
  readonly clusters: readonly ClusterPlacementView[];
  readonly racks: readonly RackPlacementView[];
  readonly assignableSlots: readonly RectMm[];
}

export class SpatialService {
  constructor(private readonly repository: TopologyRepository) {}

  async updateRoomPolygon(
    roomId: string,
    polygon: readonly PointMm[],
    expectedVersion?: string,
  ): Promise<Result<RoomSubstructureNode, SpatialError>> {
    const current = await readLayoutDraft(this.repository, roomId);
    if (!current) return failure('ROOM_NOT_FOUND');
    if (!expectedVersion || expectedVersion !== current.draft.version) return failure('LAYOUT_CONFLICT');
    const prepared = await prepareLayoutSave(this.repository, roomId, {
      ...current.draft, polygon: [...polygon], version: expectedVersion,
    });
    if ('error' in prepared) return failure(prepared.error);
    if (!this.repository.commitLayout) return failure('ATOMIC_LAYOUT_STORAGE_REQUIRED');
    if (!(await this.repository.commitLayout(prepared.before, prepared.after))) return failure('LAYOUT_CONFLICT');
    return success(prepared.after[0] as RoomSubstructureNode);
  }

  async getRoomLayout(roomId: string): Promise<Result<RoomLayout, SpatialError>> {
    const node = await this.repository.getById(roomId);

    if (!node || node.kind !== 'ROOM_SUBSTRUCTURE') {
      return failure('ROOM_NOT_FOUND');
    }

    const clusters = (await this.repository.listChildren(roomId)).filter(
      (child): child is ContainerClusterBayNode =>
        child.kind === 'CONTAINER_CLUSTER_BAY' && child.lifecycle === 'ACTIVE',
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
      clusters: clusters.map((cluster) => ({
        id: cluster.id,
        name: cluster.name,
        ...(cluster.polygon ? { polygon: cluster.polygon } : {}),
      })),
      racks,
      assignableSlots,
    });
  }
}
