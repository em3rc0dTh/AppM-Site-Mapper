import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  ClusterOrientation,
  ContainerClusterBayNode,
  ContainerRackNode,
  PositionNode,
  RoomSubstructureNode,
  SiteNode,
  StructureNode,
  TopologyNode,
} from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';
import {
  isValidPolygon,
  polygonContainedByPolygon,
  rectsOverlap,
  type PointMm,
  type RectMm,
} from '@/modules/spatial/domain/geometry';
import { generateAssignableSlots } from '@/modules/spatial/domain/placement';
import { gridCoordinateToPoint, TILE_SIZE_MM } from '@/modules/spatial/domain/grid';
import { resolveRackFootprint } from '@/modules/spatial/domain/rack-footprint';

export type SpatialBoundaryNode = SiteNode | StructureNode | RoomSubstructureNode;
export type SpatialError =
  | 'ROOM_NOT_FOUND'
  | 'BOUNDARY_NODE_NOT_FOUND'
  | 'UNSUPPORTED_BOUNDARY_KIND'
  | 'INVALID_POLYGON'
  | 'BOUNDARY_OUTSIDE_PARENT';

export interface RackPlacementView {
  readonly id: string;
  readonly positionId: string;
  readonly clusterId: string;
  readonly name: string;
  readonly variant: ContainerRackNode['variant'];
  readonly dimensionsMm: Readonly<{ width: number; depth: number; height?: number }>;
  readonly rect: RectMm;
}

export interface PositionPlacementView {
  readonly id: string;
  readonly name: string;
  readonly coordinate: string;
  readonly clusterId: string;
  readonly clusterName: string;
  readonly rect: RectMm;
  readonly occupied: boolean;
  readonly occupancyRole?: 'ANCHOR' | 'COVERED';
  readonly rack?: RackPlacementView;
}

export interface ClusterPlacementView {
  readonly id: string;
  readonly name: string;
  readonly variant: ContainerClusterBayNode['variant'];
  readonly rect?: RectMm;
  readonly positionCount: number;
  readonly orientation?: ClusterOrientation;
}

export interface RoomLayout {
  readonly room: RoomSubstructureNode;
  readonly clusters: readonly ClusterPlacementView[];
  readonly positions: readonly PositionPlacementView[];
  readonly racks: readonly RackPlacementView[];
  readonly assignableSlots: readonly RectMm[];
}

function isBoundaryNode(node: TopologyNode): node is SpatialBoundaryNode {
  return node.kind === 'SITE' || node.kind === 'STRUCTURE' || node.kind === 'ROOM_SUBSTRUCTURE';
}

export class SpatialService {
  constructor(private readonly repository: TopologyRepository) {}

  async updateBoundary(
    nodeId: string,
    polygon: readonly PointMm[],
  ): Promise<Result<SpatialBoundaryNode, SpatialError>> {
    const node = await this.repository.getById(nodeId);

    if (!node) {
      return failure('BOUNDARY_NODE_NOT_FOUND');
    }

    if (!isBoundaryNode(node)) {
      return failure('UNSUPPORTED_BOUNDARY_KIND');
    }

    if (!isValidPolygon(polygon)) {
      return failure('INVALID_POLYGON');
    }

    if (node.kind === 'STRUCTURE') {
      const parent = node.parentId ? await this.repository.getById(node.parentId) : null;
      if (
        parent?.kind === 'SITE' &&
        parent.polygon &&
        parent.polygon.length >= 3 &&
        !polygonContainedByPolygon(polygon, parent.polygon)
      ) {
        return failure('BOUNDARY_OUTSIDE_PARENT');
      }
    }

    const updated: SpatialBoundaryNode = {
      ...node,
      polygon,
      updatedAt: nowIso(),
    };

    await this.repository.replace(updated);
    return success(updated);
  }

  async getBoundary(
    nodeId: string,
  ): Promise<Result<SpatialBoundaryNode, 'BOUNDARY_NODE_NOT_FOUND' | 'UNSUPPORTED_BOUNDARY_KIND'>> {
    const node = await this.repository.getById(nodeId);

    if (!node) {
      return failure('BOUNDARY_NODE_NOT_FOUND');
    }

    if (!isBoundaryNode(node)) {
      return failure('UNSUPPORTED_BOUNDARY_KIND');
    }

    return success(node);
  }

  async updateRoomPolygon(
    roomId: string,
    polygon: readonly PointMm[],
  ): Promise<Result<RoomSubstructureNode, SpatialError>> {
    const node = await this.repository.getById(roomId);

    if (!node || node.kind !== 'ROOM_SUBSTRUCTURE') {
      return failure('ROOM_NOT_FOUND');
    }

    const result = await this.updateBoundary(roomId, polygon);
    return result.ok ? success(result.value as RoomSubstructureNode) : result;
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

    const positionsByCluster = await Promise.all(
      clusters.map(async (cluster) => {
        const positions = (await this.repository.listChildren(cluster.id)).filter(
          (child): child is PositionNode =>
            child.kind === 'POSITION' && child.lifecycle === 'ACTIVE',
        );
        return { cluster, positions };
      }),
    );

    const positions = positionsByCluster.flatMap(({ cluster, positions: clusterPositions }) =>
      clusterPositions.map((position) => {
        const point = gridCoordinateToPoint(position.coordinate);
        return {
          id: position.id,
          name: position.name,
          coordinate: `${position.coordinate.row}-${position.coordinate.column}`,
          clusterId: cluster.id,
          clusterName: cluster.name,
          rect: {
            x: point.x,
            y: point.y,
            width: TILE_SIZE_MM,
            depth: TILE_SIZE_MM,
          },
        };
      }),
    );

    const racksByPosition = await Promise.all(
      positionsByCluster.flatMap(({ cluster, positions: clusterPositions }) =>
        clusterPositions.map(async (position) => {
          const racks = (await this.repository.listChildren(position.id)).filter(
            (child): child is ContainerRackNode =>
              child.kind === 'CONTAINER_RACK' && child.lifecycle === 'ACTIVE',
          );
          return { cluster, position, racks };
        }),
      ),
    );

    const racks: RackPlacementView[] = racksByPosition.flatMap(
      ({ cluster, position, racks: positionRacks }) => {
        const point = gridCoordinateToPoint(position.coordinate);

        return positionRacks.map((rack) => {
          const dimensionsMm = rack.dimensionsMm ?? {
            width: TILE_SIZE_MM,
            depth: TILE_SIZE_MM,
          };
          const resolved =
            cluster.run && node.polygon
              ? resolveRackFootprint(position.coordinate, cluster.run, dimensionsMm, node.polygon)
              : null;

          return {
            id: rack.id,
            positionId: position.id,
            clusterId: cluster.id,
            name: rack.name,
            variant: rack.variant,
            dimensionsMm,
            rect:
              resolved?.ok
                ? resolved.rect
                : {
                    x: point.x,
                    y: point.y,
                    width: dimensionsMm.width,
                    depth: dimensionsMm.depth,
                  },
          };
        });
      },
    );

    const positionViews: PositionPlacementView[] = positions.map((position) => {
      const rack = racks.find((candidate) => rectsOverlap(position.rect, candidate.rect));

      return {
        ...position,
        occupied: Boolean(rack),
        ...(rack
          ? {
              rack,
              occupancyRole: rack.positionId === position.id ? ('ANCHOR' as const) : ('COVERED' as const),
            }
          : {}),
      };
    });

    const clusterViews: ClusterPlacementView[] = positionsByCluster.map(
      ({ cluster, positions: clusterPositions }) => {
        if (!cluster.run || clusterPositions.length === 0) {
          return {
            id: cluster.id,
            name: cluster.name,
            variant: cluster.variant,
            positionCount: clusterPositions.length,
            ...(cluster.run ? { orientation: cluster.run.orientation } : {}),
          };
        }

        const rects = clusterPositions.map((position) => {
          const point = gridCoordinateToPoint(position.coordinate);
          return {
            x: point.x,
            y: point.y,
            width: TILE_SIZE_MM,
            depth: TILE_SIZE_MM,
          };
        });
        const minX = Math.min(...rects.map((rect) => rect.x));
        const minY = Math.min(...rects.map((rect) => rect.y));
        const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
        const maxY = Math.max(...rects.map((rect) => rect.y + rect.depth));

        return {
          id: cluster.id,
          name: cluster.name,
          variant: cluster.variant,
          rect: {
            x: minX,
            y: minY,
            width: maxX - minX,
            depth: maxY - minY,
          },
          positionCount: clusterPositions.length,
          ...(cluster.run ? { orientation: cluster.run.orientation } : {}),
        };
      },
    );

    const occupied = racks.map((rack) => rack.rect);
    const assignableSlots = node.polygon ? generateAssignableSlots(node.polygon, occupied) : [];

    return success({
      room: node,
      clusters: clusterViews,
      positions: positionViews,
      racks,
      assignableSlots,
    });
  }
}
