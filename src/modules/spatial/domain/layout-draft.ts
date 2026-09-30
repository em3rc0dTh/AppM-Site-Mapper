import type { PointMm, RectMm } from './geometry';
import {
  isValidPolygon,
  pointInPolygon,
  polygonBounds,
  polygonInsidePolygon,
  rectInsidePolygon,
  rectOverlapsPolygon,
  rectsOverlap,
} from './geometry';
import { gridCoordinateToPoint, pointToGridCoordinate, TILE_SIZE_MM } from './grid';
export interface DraftCluster {
  variant?: 'BAY' | 'CONTAINER_CLUSTER';
  id: string;
  name: string;
  polygon: PointMm[];
}
export interface DraftPosition {
  id: string;
  name: string;
  clusterId: string;
  row: string;
  column: number;
}
export interface DraftRack {
  id: string;
  name: string;
  positionId: string;
  width: number;
  depth: number;
  totalU: number;
}
export interface LayoutDraft {
  version: string;
  polygon: PointMm[];
  clusters: DraftCluster[];
  positions: DraftPosition[];
  racks: DraftRack[];
}


function rackRect(
  rack: Pick<DraftRack, 'width' | 'depth'>,
  position: Pick<DraftPosition, 'row' | 'column'>,
): RectMm {
  return { ...gridCoordinateToPoint(position), width: rack.width, depth: rack.depth };
}

function rackPlacementIssue(
  draft: LayoutDraft,
  rack: Pick<DraftRack, 'id' | 'width' | 'depth'>,
  position: DraftPosition,
): string | null {
  const cluster = draft.clusters.find((candidate) => candidate.id === position.clusterId);
  if (!cluster) return 'INVALID_CLUSTER';

  const rect = rackRect(rack, position);
  const bounds = polygonBounds(cluster.polygon);
  if (!bounds) return 'INVALID_CLUSTER_BOUNDARY';

  const epsilon = 1e-7;
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  if (
    Math.abs(rect.y - bounds.minY) > epsilon ||
    rect.x < bounds.minX - epsilon ||
    rect.x + rect.width > bounds.maxX + epsilon ||
    !pointInPolygon(topLeft, cluster.polygon) ||
    !pointInPolygon(topRight, cluster.polygon)
  )
    return 'RACK_OUTSIDE_BAY_WIDTH';

  if (!rectInsidePolygon(rect, draft.polygon)) return 'RACK_OUTSIDE_ROOM';

  if (
    draft.clusters.some(
      (candidate) =>
        candidate.id !== cluster.id && rectOverlapsPolygon(rect, candidate.polygon),
    )
  )
    return 'RACK_DEPTH_BLOCKED_BY_BAY';

  for (const other of draft.racks) {
    if (other.id === rack.id) continue;
    const otherPosition = draft.positions.find((candidate) => candidate.id === other.positionId);
    if (!otherPosition) continue;
    if (rectsOverlap(rect, rackRect(other, otherPosition))) return 'RACK_COLLISION';
  }

  return null;
}

export function findNextRackCoordinate(
  draft: LayoutDraft,
  clusterId: string,
  width: number,
  depth: number,
): { row: string; column: number } | null {
  const cluster = draft.clusters.find((candidate) => candidate.id === clusterId);
  const bounds = cluster ? polygonBounds(cluster.polygon) : null;
  if (!cluster || !bounds || width <= 0 || depth <= 0) return null;

  const topGridY = Math.round(bounds.minY / TILE_SIZE_MM) * TILE_SIZE_MM;
  if (Math.abs(topGridY - bounds.minY) > 1e-7 || topGridY < 0) return null;

  const firstColumnIndex = Math.ceil(bounds.minX / TILE_SIZE_MM);
  const lastColumnIndex = Math.floor((bounds.maxX - width) / TILE_SIZE_MM);

  for (let columnIndex = firstColumnIndex; columnIndex <= lastColumnIndex; columnIndex += 1) {
    const coordinate = pointToGridCoordinate({
      x: columnIndex * TILE_SIZE_MM,
      y: topGridY,
    });
    if (!coordinate) continue;

    const occupiedByPosition = draft.positions.find(
      (position) =>
        position.row === coordinate.row &&
        position.column === coordinate.column &&
        position.clusterId !== clusterId,
    );
    if (occupiedByPosition) continue;

    const candidatePosition: DraftPosition = {
      id: '__rack_candidate__',
      name: 'Rack candidate',
      clusterId,
      ...coordinate,
    };
    const issue = rackPlacementIssue(
      draft,
      { id: '__rack_candidate__', width, depth },
      candidatePosition,
    );
    if (!issue) return coordinate;
  }

  return null;
}
export function validateLayoutDraft(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'INVALID_LAYOUT';
  const d = value as LayoutDraft;
  const polygon = (p: unknown): p is PointMm[] =>
    Array.isArray(p) &&
    p.length >= 3 &&
    p.length <= 256 &&
    p.every(
      (v) =>
        v &&
        typeof v === 'object' &&
        typeof v.x === 'number' &&
        typeof v.y === 'number' &&
        Math.abs(v.x) <= 1000000 &&
        Math.abs(v.y) <= 1000000,
    ) &&
    isValidPolygon(p);
  if (
    typeof d.version !== 'string' ||
    !polygon(d.polygon) ||
    !Array.isArray(d.clusters) ||
    !Array.isArray(d.positions) ||
    !Array.isArray(d.racks) ||
    d.clusters.length > 200 ||
    d.positions.length > 2000 ||
    d.racks.length > 2000
  )
    return 'INVALID_LAYOUT';
  const ids = new Set<string>();
  const named = (v: { id: string; name: string }) =>
    v &&
    typeof v.id === 'string' &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(v.id) &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    v.name.length <= 120 &&
    !ids.has(v.id) &&
    !!ids.add(v.id);
  for (const c of d.clusters)
    if (!named(c) || (c.variant !== undefined && c.variant !== 'BAY' && c.variant !== 'CONTAINER_CLUSTER') || !polygon(c.polygon) || !polygonInsidePolygon(c.polygon, d.polygon))
      return 'INVALID_CLUSTER_BOUNDARY';
  const occupied = new Set<string>();
  const cells = new Set<string>();
  const rects: RectMm[] = [];
  for (const p of d.positions) {
    if (
      !named(p) ||
      typeof p.row !== 'string' ||
      !/^[A-Z]{1,3}$/.test(p.row) ||
      !Number.isInteger(p.column) ||
      p.column < 1 ||
      p.column > 1000
    )
      return 'INVALID_POSITION';
    const cluster = d.clusters.find((c) => c.id === p.clusterId);
    if (!cluster) return 'INVALID_CLUSTER';
    const point = gridCoordinateToPoint(p);
    const rect = { ...point, width: 600, depth: 600 };
    if (!rectInsidePolygon(rect, d.polygon) || !rectInsidePolygon(rect, cluster.polygon))
      return 'POSITION_OUTSIDE_BOUNDARY';
    const cell = `${p.row}:${p.column}`;
    if (cells.has(cell)) return 'POSITION_COLLISION';
    cells.add(cell);
  }
  for (const r of d.racks) {
    if (
      !named(r) ||
      ![r.width, r.depth, r.totalU].every(Number.isInteger) ||
      r.width < 1 ||
      r.depth < 1 ||
      r.width > 10000 ||
      r.depth > 10000 ||
      r.totalU < 1 ||
      r.totalU > 100
    )
      return 'INVALID_RACK';
    const p = d.positions.find((p) => p.id === r.positionId);
    if (!p) return 'INVALID_POSITION';
    if (occupied.has(p.id)) return 'POSITION_OCCUPIED';
    occupied.add(p.id);
    const rect = rackRect(r, p);
    const placementIssue = rackPlacementIssue(d, r, p);
    if (placementIssue) return placementIssue;
    if (rects.some((other) => rectsOverlap(rect, other))) return 'RACK_COLLISION';
    rects.push(rect);
  }
  return null;
}
