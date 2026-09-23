import type { GridCoordinate } from '@/modules/topology/domain/entities';

import type { PointMm } from './geometry';

export const TILE_SIZE_MM = 600;

function rowToIndex(row: string): number {
  const normalized = row.trim().toUpperCase();

  if (!/^[A-Z]+$/.test(normalized)) {
    throw new Error('Grid row must contain letters only.');
  }

  let value = 0;

  for (const character of normalized) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }

  return value - 1;
}

export function gridCoordinateToPoint(coordinate: GridCoordinate): PointMm {
  if (!Number.isInteger(coordinate.column) || coordinate.column < 1) {
    throw new Error('Grid column must be a positive integer.');
  }

  return {
    x: (coordinate.column - 1) * TILE_SIZE_MM,
    y: rowToIndex(coordinate.row) * TILE_SIZE_MM,
  };
}

export function snapToGrid(point: PointMm): PointMm {
  return {
    x: Math.round(point.x / TILE_SIZE_MM) * TILE_SIZE_MM,
    y: Math.round(point.y / TILE_SIZE_MM) * TILE_SIZE_MM,
  };
}
