import {
  pointInPolygon,
  rectInsidePolygon,
  rectsOverlap,
  type PointMm,
  type RectMm,
} from '@/modules/spatial/domain/geometry';
import { TILE_SIZE_MM } from '@/modules/spatial/domain/grid';

export type PlacementError = 'OUTSIDE_ROOM' | 'COLLISION';

export function validatePlacement(
  candidate: RectMm,
  roomPolygon: readonly PointMm[],
  occupied: readonly RectMm[],
): readonly PlacementError[] {
  const errors: PlacementError[] = [];

  if (!rectInsidePolygon(candidate, roomPolygon)) {
    errors.push('OUTSIDE_ROOM');
  }

  if (occupied.some((rect) => rectsOverlap(candidate, rect))) {
    errors.push('COLLISION');
  }

  return errors;
}

export function generateAssignableSlots(
  roomPolygon: readonly PointMm[],
  occupied: readonly RectMm[],
): readonly RectMm[] {
  if (roomPolygon.length < 3) {
    return [];
  }

  const xs = roomPolygon.map((point) => point.x);
  const ys = roomPolygon.map((point) => point.y);
  const minX = Math.floor(Math.min(...xs) / TILE_SIZE_MM) * TILE_SIZE_MM;
  const maxX = Math.ceil(Math.max(...xs) / TILE_SIZE_MM) * TILE_SIZE_MM;
  const minY = Math.floor(Math.min(...ys) / TILE_SIZE_MM) * TILE_SIZE_MM;
  const maxY = Math.ceil(Math.max(...ys) / TILE_SIZE_MM) * TILE_SIZE_MM;
  const slots: RectMm[] = [];

  for (let y = minY; y < maxY; y += TILE_SIZE_MM) {
    for (let x = minX; x < maxX; x += TILE_SIZE_MM) {
      const slot: RectMm = {
        x,
        y,
        width: TILE_SIZE_MM,
        depth: TILE_SIZE_MM,
      };
      const center = {
        x: x + TILE_SIZE_MM / 2,
        y: y + TILE_SIZE_MM / 2,
      };

      if (
        pointInPolygon(center, roomPolygon) &&
        !occupied.some((rect) => rectsOverlap(slot, rect))
      ) {
        slots.push(slot);
      }
    }
  }

  return slots;
}
