import type { GridCoordinate } from '@/modules/topology/domain/entities';

import type { PointMm } from './geometry';

export const TILE_SIZE_MM = 600;

export function rowToIndex(row: string): number {
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


export function rowFromIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Grid row index must be a non-negative integer.');
  }

  let value = index + 1;
  let result = '';

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
}

export function pointToGridCoordinate(point: PointMm): GridCoordinate {
  const columnIndex = Math.floor(point.x / TILE_SIZE_MM);
  const rowIndex = Math.floor(point.y / TILE_SIZE_MM);

  if (columnIndex < 0 || rowIndex < 0) {
    throw new Error('Grid point must be within the positive Blueprint coordinate space.');
  }

  return {
    row: rowFromIndex(rowIndex),
    column: columnIndex + 1,
  };
}

export function linearGridRun(
  start: GridCoordinate,
  end: GridCoordinate,
): readonly GridCoordinate[] {
  if (
    !Number.isInteger(start.column) ||
    !Number.isInteger(end.column) ||
    start.column < 1 ||
    end.column < 1
  ) {
    throw new Error('Grid columns must be positive integers.');
  }

  const startRow = rowToIndex(start.row);
  const endRow = rowToIndex(end.row);

  if (startRow !== endRow && start.column !== end.column) {
    throw new Error('Cluster run must be horizontal or vertical.');
  }

  if (startRow === endRow) {
    const from = Math.min(start.column, end.column);
    const to = Math.max(start.column, end.column);
    return Array.from({ length: to - from + 1 }, (_, index) => ({
      row: rowFromIndex(startRow),
      column: from + index,
    }));
  }

  const from = Math.min(startRow, endRow);
  const to = Math.max(startRow, endRow);
  return Array.from({ length: to - from + 1 }, (_, index) => ({
    row: rowFromIndex(from + index),
    column: start.column,
  }));
}
