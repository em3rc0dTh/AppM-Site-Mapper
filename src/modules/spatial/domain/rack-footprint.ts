import type { ClusterRun, DimensionsMm, GridCoordinate } from '@/modules/topology/domain/entities';

import { rectInsidePolygon, type PointMm, type RectMm } from './geometry';
import { gridCoordinateToPoint, linearGridRun, rowToIndex, TILE_SIZE_MM } from './grid';

export type RackFootprintError =
  | 'RACK_ANCHOR_OUTSIDE_CLUSTER_RUN'
  | 'RACK_WIDTH_EXCEEDS_CLUSTER_RUN'
  | 'RACK_FOOTPRINT_OUTSIDE_ROOM';

export type RackFootprintResolution =
  | Readonly<{
      ok: true;
      rect: RectMm;
      coveredCoordinates: readonly GridCoordinate[];
    }>
  | Readonly<{ ok: false; error: RackFootprintError }>;

function coordinateKey(coordinate: GridCoordinate): string {
  return `${coordinate.row.toUpperCase()}-${coordinate.column}`;
}

function orderedRun(run: ClusterRun): readonly GridCoordinate[] {
  const coordinates = [...linearGridRun(run.start, run.end)];

  return coordinateKey(coordinates[0]!) === coordinateKey(run.start)
    ? coordinates
    : coordinates.reverse();
}

export function resolveRackFootprint(
  anchor: GridCoordinate,
  run: ClusterRun,
  dimensions: DimensionsMm,
  roomPolygon: readonly PointMm[],
): RackFootprintResolution {
  const coordinates = orderedRun(run);
  const anchorIndex = coordinates.findIndex(
    (coordinate) => coordinateKey(coordinate) === coordinateKey(anchor),
  );

  if (anchorIndex < 0) {
    return { ok: false, error: 'RACK_ANCHOR_OUTSIDE_CLUSTER_RUN' };
  }

  const requiredSlots = Math.max(1, Math.ceil(dimensions.width / TILE_SIZE_MM));
  const coveredCoordinates = coordinates.slice(anchorIndex, anchorIndex + requiredSlots);

  if (coveredCoordinates.length !== requiredSlots) {
    return { ok: false, error: 'RACK_WIDTH_EXCEEDS_CLUSTER_RUN' };
  }

  const anchorPoint = gridCoordinateToPoint(anchor);
  const horizontal = run.orientation === 'HORIZONTAL';
  const alongDirection = horizontal
    ? Math.sign(run.end.column - run.start.column) || 1
    : Math.sign(rowToIndex(run.end.row) - rowToIndex(run.start.row)) || 1;

  const alongOrigin = horizontal
    ? alongDirection > 0
      ? anchorPoint.x
      : anchorPoint.x + TILE_SIZE_MM - dimensions.width
    : alongDirection > 0
      ? anchorPoint.y
      : anchorPoint.y + TILE_SIZE_MM - dimensions.width;

  const positivePerpendicular: RectMm = horizontal
    ? {
        x: alongOrigin,
        y: anchorPoint.y,
        width: dimensions.width,
        depth: dimensions.depth,
      }
    : {
        x: anchorPoint.x,
        y: alongOrigin,
        width: dimensions.depth,
        depth: dimensions.width,
      };

  const negativePerpendicular: RectMm = horizontal
    ? {
        x: alongOrigin,
        y: anchorPoint.y + TILE_SIZE_MM - dimensions.depth,
        width: dimensions.width,
        depth: dimensions.depth,
      }
    : {
        x: anchorPoint.x + TILE_SIZE_MM - dimensions.depth,
        y: alongOrigin,
        width: dimensions.depth,
        depth: dimensions.width,
      };

  if (rectInsidePolygon(positivePerpendicular, roomPolygon)) {
    return { ok: true, rect: positivePerpendicular, coveredCoordinates };
  }

  if (rectInsidePolygon(negativePerpendicular, roomPolygon)) {
    return { ok: true, rect: negativePerpendicular, coveredCoordinates };
  }

  return { ok: false, error: 'RACK_FOOTPRINT_OUTSIDE_ROOM' };
}
