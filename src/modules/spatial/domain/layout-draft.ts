import type { PointMm, RectMm } from './geometry';
import {
  isValidPolygon,
  pointInPolygon,
  polygonBounds,
  polygonInsidePolygon,
  polygonsOverlapArea,
  rectInsidePolygon,
  rectOverlapsPolygon,
  rectsOverlap,
} from './geometry';
import { gridCoordinateToPoint, pointToGridCoordinate } from './grid';
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
  /** Exact physical top-left anchor in the Room plane; independent from the 600 mm grid reference. */
  x: number;
  y: number;
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

function rackRect(rack: Pick<DraftRack, 'x' | 'y' | 'width' | 'depth'>): RectMm {
  return { x: rack.x, y: rack.y, width: rack.width, depth: rack.depth };
}

function rackPlacementIssue(
  draft: LayoutDraft,
  rack: Pick<DraftRack, 'id' | 'x' | 'y' | 'width' | 'depth'>,
  position: DraftPosition,
): string | null {
  const cluster = draft.clusters.find((candidate) => candidate.id === position.clusterId);
  if (!cluster) return 'INVALID_CLUSTER';

  const rect = rackRect(rack);
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
      (candidate) => candidate.id !== cluster.id && rectOverlapsPolygon(rect, candidate.polygon),
    )
  )
    return 'RACK_DEPTH_BLOCKED_BY_BAY';

  for (const other of draft.racks) {
    if (other.id === rack.id) continue;
    if (rectsOverlap(rect, rackRect(other))) return 'RACK_COLLISION';
  }

  return null;
}

export interface RackPlacement {
  readonly point: PointMm;
  readonly coordinate: { row: string; column: number };
}

export function findNextRackPlacement(
  draft: LayoutDraft,
  clusterId: string,
  width: number,
  depth: number,
): RackPlacement | null {
  const cluster = draft.clusters.find((candidate) => candidate.id === clusterId);
  const bounds = cluster ? polygonBounds(cluster.polygon) : null;
  if (!cluster || !bounds || width <= 0 || depth <= 0 || bounds.minY < 0) return null;

  const candidates = new Set<number>([bounds.minX]);

  for (const existing of draft.racks) {
    const position = draft.positions.find((candidate) => candidate.id === existing.positionId);
    if (position?.clusterId === clusterId) candidates.add(existing.x + existing.width);
  }

  for (const other of draft.clusters) {
    if (other.id === clusterId) continue;
    const otherBounds = polygonBounds(other.polygon);
    if (otherBounds) candidates.add(otherBounds.maxX);
  }

  for (const x of [...candidates].sort((left, right) => left - right)) {
    if (x < bounds.minX || x + width > bounds.maxX) continue;

    const point = { x, y: bounds.minY };
    const coordinate = pointToGridCoordinate(point);
    if (!coordinate) continue;

    const candidatePosition: DraftPosition = {
      id: '__rack_candidate__',
      name: 'Rack candidate',
      clusterId,
      ...coordinate,
    };
    const issue = rackPlacementIssue(
      draft,
      {
        id: '__rack_candidate__',
        x: point.x,
        y: point.y,
        width,
        depth,
      },
      candidatePosition,
    );
    if (!issue) return { point, coordinate };
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
    if (
      !named(c) ||
      (c.variant !== undefined && c.variant !== 'BAY' && c.variant !== 'CONTAINER_CLUSTER') ||
      !polygon(c.polygon) ||
      !polygonInsidePolygon(c.polygon, d.polygon)
    )
      return 'INVALID_CLUSTER_BOUNDARY';
  for (let index = 0; index < d.clusters.length; index += 1) {
    const current = d.clusters[index]!;
    for (let otherIndex = index + 1; otherIndex < d.clusters.length; otherIndex += 1) {
      const other = d.clusters[otherIndex]!;
      if (polygonsOverlapArea(current.polygon, other.polygon)) return 'CLUSTER_COLLISION';
    }
  }

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
  const rackNames = new Set<string>();
  for (const r of d.racks) {
    if (
      !named(r) ||
      ![r.x, r.y, r.width, r.depth, r.totalU].every(Number.isInteger) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width < 1 ||
      r.depth < 1 ||
      r.width > 10000 ||
      r.depth > 10000 ||
      r.totalU < 1 ||
      r.totalU > 100
    )
      return 'INVALID_RACK';
    const normalizedRackName = r.name.trim().toLocaleLowerCase();
    if (rackNames.has(normalizedRackName)) return 'DUPLICATE_RACK_NAME';
    rackNames.add(normalizedRackName);
    const p = d.positions.find((p) => p.id === r.positionId);
    if (!p) return 'INVALID_POSITION';
    if (occupied.has(p.id)) return 'POSITION_OCCUPIED';
    occupied.add(p.id);
    const rect = rackRect(r);
    const placementIssue = rackPlacementIssue(d, r, p);
    if (placementIssue) return placementIssue;
    if (rects.some((other) => rectsOverlap(rect, other))) return 'RACK_COLLISION';
    rects.push(rect);
  }
  return null;
}
