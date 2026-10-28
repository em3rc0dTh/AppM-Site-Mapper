import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { ContainerRackNode, DeviceNode, PositionNode, TopologyNode } from '@/modules/topology/domain/entities';
import {
  findNextRackPlacement,
  validateLayoutDraft,
  type LayoutDraft,
  type DraftRack,
  type DraftPosition,
} from '@/modules/spatial/domain/layout-draft';
import { gridCoordinateToPoint } from '@/modules/spatial/domain/grid';

/**
 * BDFB-PHYS-001. A rack is generic. Its BDFB placement policy comes only
 * from the canonical Device.deviceType. Legacy/confirmed racks never move.
 * This is pure: a failed plan leaves every coordinate unchanged.
 */
export function reflowForBdfb(
  draft: LayoutDraft,
  rackId: string,
  movableIds: ReadonlySet<string>,
): LayoutDraft | null {
  const target = draft.racks.find((item) => item.id === rackId);
  if (!target || !movableIds.has(target.id) || target.placementState !== 'AUTO_PROVISIONAL')
    return null;
  const anchor = draft.positions.find((item) => item.id === target.positionId);
  if (!anchor) return null;
  const clusterId = anchor.clusterId;
  const moving = draft.racks.filter((item) =>
    movableIds.has(item.id) &&
    item.placementState === 'AUTO_PROVISIONAL' &&
    draft.positions.some((position) =>
      position.id === item.positionId && position.clusterId === clusterId));
  const other = moving.filter((item) => item.id !== target.id)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const movingIds = new Set(moving.map((item) => item.id));
  const movingPositions = new Set(moving.map((item) => item.positionId));
  let next: LayoutDraft = {
    ...draft,
    racks: draft.racks.filter((item) => !movingIds.has(item.id)),
    positions: draft.positions.filter((item) => !movingPositions.has(item.id)),
  };

  function append(item: DraftRack, direction: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT'): boolean {
    const candidate = findNextRackPlacement(next, clusterId, item.width, item.depth, direction);
    const originalPosition = draft.positions.find((position) => position.id === item.positionId);
    if (!candidate || !originalPosition) return false;
    const position: DraftPosition = {
      ...originalPosition,
      row: candidate.coordinate.row,
      column: candidate.coordinate.column,
    };
    next = {
      ...next,
      positions: [...next.positions, position],
      racks: [...next.racks, {
        ...item, x: candidate.point.x, y: candidate.point.y,
        ...(item.id === rackId ? { placementState: 'CONFIRMED' as const } : {}),
      }],
    };
    return true;
  }
  // Rightmost BDFB is reserved first; conventional auto-racks then pack left.
  if (!append(target, 'RIGHT_TO_LEFT')) return null;
  for (const rack of other)
    if (!append(rack, 'LEFT_TO_RIGHT')) return null;
  return validateLayoutDraft(next) === null ? next : null;
}

export type RackMountPlan =
  | { readonly before: TopologyNode[]; readonly after: TopologyNode[] }
  | { readonly error: 'BDFB_PLACEMENT_BLOCKED' };

function freshTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
}

export async function prepareDeviceRackPlacement(
  repo: TopologyRepository,
  rack: ContainerRackNode,
  device: DeviceNode,
): Promise<RackMountPlan> {
  const confirmed = {
    ...rack, placementState: 'CONFIRMED' as const, updatedAt: freshTimestamp(rack.updatedAt),
  };
  if (device.deviceType !== 'BDFB') return { before: [rack], after: [confirmed] };

  const targetPosition = await repo.getById(rack.parentId);
  const cluster = targetPosition?.kind === 'POSITION'
    ? await repo.getById(targetPosition.parentId) : null;
  const room = cluster?.kind === 'CONTAINER_CLUSTER_BAY'
    ? await repo.getById(cluster.parentId) : null;
  if (!targetPosition || targetPosition.kind !== 'POSITION' ||
      !cluster || cluster.kind !== 'CONTAINER_CLUSTER_BAY' ||
      !room || room.kind !== 'ROOM_SUBSTRUCTURE' || !room.polygon ||
      room.lifecycle !== 'ACTIVE' || cluster.lifecycle !== 'ACTIVE')
    return { error: 'BDFB_PLACEMENT_BLOCKED' };

  const clusters = (await repo.listChildren(room.id)).filter((item) =>
    item.kind === 'CONTAINER_CLUSTER_BAY' && item.lifecycle === 'ACTIVE');
  const positions = (await Promise.all(clusters.map((item) => repo.listChildren(item.id))))
    .flat().filter((item): item is PositionNode =>
      item.kind === 'POSITION' && item.lifecycle === 'ACTIVE');
  const racks = (await Promise.all(positions.map((item) => repo.listChildren(item.id))))
    .flat().filter((item): item is ContainerRackNode =>
      item.kind === 'CONTAINER_RACK' && item.lifecycle === 'ACTIVE');
  if (!racks.some((item) => item.id === rack.id)) return { error: 'BDFB_PLACEMENT_BLOCKED' };

  const draft: LayoutDraft = {
    version: room.updatedAt,
    polygon: [...room.polygon],
    clusters: clusters.map((item) => ({
      id: item.id, name: item.name,
      variant: item.kind === 'CONTAINER_CLUSTER_BAY' ? item.variant : 'BAY',
      polygon: item.kind === 'CONTAINER_CLUSTER_BAY' ? [...(item.polygon ?? [])] : [],
    })),
    positions: positions.map((item) => ({
      id: item.id, name: item.name, clusterId: item.parentId,
      row: item.coordinate.row, column: item.coordinate.column,
    })),
    racks: racks.map((item) => {
      const position = positions.find((candidate) => candidate.id === item.parentId);
      const legacy = position ? gridCoordinateToPoint(position.coordinate) : { x: 0, y: 0 };
      return {
        id: item.id, name: item.name, positionId: item.parentId,
        x: item.placementMm?.x ?? legacy.x, y: item.placementMm?.y ?? legacy.y,
        width: item.dimensionsMm?.width ?? 600, depth: item.dimensionsMm?.depth ?? 600,
        totalU: item.totalU ?? 42,
        ...(item.placementState ? { placementState: item.placementState } : {}),
      };
    }),
  };

  // Physical occupants are authoritative: an empty auto-rack may move;
  // an occupied or historical rack always remains at its confirmed coordinate.
  const provisional = racks.filter((item) =>
    item.placementState === 'AUTO_PROVISIONAL' &&
    positions.some((p) => p.id === item.parentId && p.parentId === cluster.id));
  const occupied = await Promise.all(provisional.map(async (item) => ({
    id: item.id,
    occupied: (await repo.listChildren(item.id)).some((child) => child.lifecycle === 'ACTIVE'),
  })));
  const movable = new Set(occupied.filter((item) => !item.occupied).map((item) => item.id));
  const planned = reflowForBdfb(draft, rack.id, movable);
  if (!planned) return { error: 'BDFB_PLACEMENT_BLOCKED' };

  const positionById = new Map(positions.map((item) => [item.id, item]));
  const rackById = new Map(racks.map((item) => [item.id, item]));
  const before: TopologyNode[] = [room];
  const after: TopologyNode[] = [{ ...room, updatedAt: freshTimestamp(room.updatedAt) }];
  for (const latest of planned.racks) {
    if (!movable.has(latest.id)) continue;
    const previous = rackById.get(latest.id)!;
    const originalPosition = positionById.get(latest.positionId)!;
    const updatedPosition = planned.positions.find((item) => item.id === latest.positionId)!;
    if (originalPosition.coordinate.row !== updatedPosition.row ||
        originalPosition.coordinate.column !== updatedPosition.column) {
      before.push(originalPosition);
      after.push({
        ...originalPosition,
        coordinate: { row: updatedPosition.row, column: updatedPosition.column },
        updatedAt: freshTimestamp(originalPosition.updatedAt),
      });
    }
    const placementState = latest.id === rack.id ? 'CONFIRMED' : 'AUTO_PROVISIONAL';
    if (previous.placementMm?.x !== latest.x || previous.placementMm?.y !== latest.y ||
        previous.placementState !== placementState) {
      before.push(previous);
      after.push({
        ...previous, placementMm: { x: latest.x, y: latest.y }, placementState,
        updatedAt: freshTimestamp(previous.updatedAt),
      });
    }
  }
  if (!before.some((item) => item.id === rack.id)) {
    before.push(rack);
    after.push(confirmed);
  }
  return { before, after };
}
