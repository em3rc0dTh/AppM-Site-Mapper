import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import {
  TopologyService,
  type TopologyError,
} from '@/modules/topology/application/topology-service';
import type {
  ClusterOrientation,
  ContainerClusterBayNode,
  GridCoordinate,
  PositionNode,
} from '@/modules/topology/domain/entities';
import { gridCoordinateToPoint, linearGridRun, TILE_SIZE_MM } from '@/modules/spatial/domain/grid';
import { rectInsidePolygon } from '@/modules/spatial/domain/geometry';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type ClusterRunError =
  | TopologyError
  | 'CLUSTER_NOT_FOUND'
  | 'ROOM_BOUNDARY_REQUIRED'
  | 'INVALID_CLUSTER_RUN'
  | 'CLUSTER_RUN_TOO_LONG'
  | 'CLUSTER_SLOT_OUTSIDE_ROOM'
  | 'CLUSTER_SLOT_OCCUPIED'
  | 'CLUSTER_RUN_OCCUPIED';

export interface ConfigureClusterRunInput {
  readonly start: GridCoordinate;
  readonly end: GridCoordinate;
}

export interface ClusterRunResult {
  readonly cluster: ContainerClusterBayNode;
  readonly positions: readonly PositionNode[];
}

function coordinateKey(coordinate: GridCoordinate): string {
  return `${coordinate.row.trim().toUpperCase()}:${coordinate.column}`;
}

function orientation(start: GridCoordinate, end: GridCoordinate): ClusterOrientation {
  return start.row.trim().toUpperCase() === end.row.trim().toUpperCase()
    ? 'HORIZONTAL'
    : 'VERTICAL';
}

export class ClusterRunAuthoringService {
  constructor(private readonly repository: TopologyRepository) {}

  async configure(
    clusterId: string,
    input: ConfigureClusterRunInput,
  ): Promise<Result<ClusterRunResult, ClusterRunError>> {
    const cluster = await this.repository.getById(clusterId);

    if (
      !cluster ||
      cluster.kind !== 'CONTAINER_CLUSTER_BAY' ||
      cluster.lifecycle !== 'ACTIVE'
    ) {
      return failure('CLUSTER_NOT_FOUND');
    }

    const room = await this.repository.getById(cluster.parentId);

    if (
      !room ||
      room.kind !== 'ROOM_SUBSTRUCTURE' ||
      room.lifecycle !== 'ACTIVE' ||
      !room.polygon ||
      room.polygon.length < 3
    ) {
      return failure('ROOM_BOUNDARY_REQUIRED');
    }

    let coordinates: readonly GridCoordinate[];

    try {
      coordinates = linearGridRun(input.start, input.end);
    } catch {
      return failure('INVALID_CLUSTER_RUN');
    }

    if (coordinates.length > 256) {
      return failure('CLUSTER_RUN_TOO_LONG');
    }

    const normalized = coordinates.map((coordinate) => ({
      row: coordinate.row.trim().toUpperCase(),
      column: coordinate.column,
    }));

    const candidateRects = normalized.map((coordinate) => {
      const point = gridCoordinateToPoint(coordinate);
      return {
        x: point.x,
        y: point.y,
        width: TILE_SIZE_MM,
        depth: TILE_SIZE_MM,
      };
    });

    if (candidateRects.some((rect) => !rectInsidePolygon(rect, room.polygon!))) {
      return failure('CLUSTER_SLOT_OUTSIDE_ROOM');
    }

    const siblingClusters = (await this.repository.listChildren(room.id)).filter(
      (node) =>
        node.kind === 'CONTAINER_CLUSTER_BAY' &&
        node.lifecycle === 'ACTIVE' &&
        node.id !== cluster.id,
    );

    const siblingPositions = (
      await Promise.all(
        siblingClusters.map(async (sibling) =>
          (await this.repository.listChildren(sibling.id)).filter(
            (node): node is PositionNode =>
              node.kind === 'POSITION' && node.lifecycle === 'ACTIVE',
          ),
        ),
      )
    ).flat();

    const occupiedCoordinates = new Set(
      siblingPositions.map((position) => coordinateKey(position.coordinate)),
    );

    if (normalized.some((coordinate) => occupiedCoordinates.has(coordinateKey(coordinate)))) {
      return failure('CLUSTER_SLOT_OCCUPIED');
    }

    const topology = new TopologyService(this.repository);
    const existing = (await this.repository.listChildren(cluster.id)).filter(
      (node): node is PositionNode => node.kind === 'POSITION' && node.lifecycle === 'ACTIVE',
    );
    const desiredKeys = new Set(normalized.map(coordinateKey));

    for (const position of existing) {
      if (desiredKeys.has(coordinateKey(position.coordinate))) {
        continue;
      }

      const activeChildren = (await this.repository.listChildren(position.id)).filter(
        (node) => node.lifecycle === 'ACTIVE',
      );

      if (activeChildren.length > 0) {
        return failure('CLUSTER_RUN_OCCUPIED');
      }
    }

    const existingByCoordinate = new Map(
      existing.map((position) => [coordinateKey(position.coordinate), position]),
    );
    const positions: PositionNode[] = [];

    for (const coordinate of normalized) {
      const key = coordinateKey(coordinate);
      const current = existingByCoordinate.get(key);

      if (current) {
        positions.push(current);
        continue;
      }

      const created = await topology.create({
        kind: 'POSITION',
        parentId: cluster.id,
        name: `${coordinate.row}-${coordinate.column}`,
        coordinate,
      });

      if (!created.ok) {
        return created;
      }

      if (created.value.kind !== 'POSITION') {
        return failure('INVALID_PARENT');
      }

      positions.push(created.value);
    }

    for (const position of existing) {
      if (!desiredKeys.has(coordinateKey(position.coordinate))) {
        const archived = await topology.archive(position.id);
        if (!archived.ok) {
          return archived;
        }
      }
    }

    const run = {
      start: {
        row: input.start.row.trim().toUpperCase(),
        column: input.start.column,
      },
      end: {
        row: input.end.row.trim().toUpperCase(),
        column: input.end.column,
      },
      orientation: orientation(input.start, input.end),
    } as const;

    const updated: ContainerClusterBayNode = {
      ...cluster,
      run,
      updatedAt: nowIso(),
    };

    await this.repository.replace(updated);

    return success({
      cluster: updated,
      positions,
    });
  }
}
