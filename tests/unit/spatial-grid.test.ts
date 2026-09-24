import { describe, expect, it } from 'vitest';

import {
  gridCoordinateToPoint,
  linearGridRun,
  pointToGridCoordinate,
  snapToGrid,
  TILE_SIZE_MM,
} from '@/modules/spatial/domain/grid';

describe('Blueprint grid', () => {
  it('uses 600 mm physical tiles with A-1 as origin', () => {
    expect(TILE_SIZE_MM).toBe(600);
    expect(gridCoordinateToPoint({ row: 'A', column: 1 })).toEqual({ x: 0, y: 0 });
    expect(gridCoordinateToPoint({ row: 'C', column: 3 })).toEqual({
      x: 1200,
      y: 1200,
    });
  });

  it('snaps physical coordinates to the nearest tile origin', () => {
    expect(snapToGrid({ x: 920, y: 280 })).toEqual({ x: 1200, y: 0 });
  });

  it('maps a click to its 600 mm slot coordinate', () => {
    expect(pointToGridCoordinate({ x: 1250, y: 650 })).toEqual({ row: 'B', column: 3 });
  });

  it('expands horizontal and vertical cluster runs inclusively', () => {
    expect(linearGridRun({ row: 'B', column: 2 }, { row: 'B', column: 5 })).toEqual([
      { row: 'B', column: 2 },
      { row: 'B', column: 3 },
      { row: 'B', column: 4 },
      { row: 'B', column: 5 },
    ]);
    expect(linearGridRun({ row: 'D', column: 7 }, { row: 'B', column: 7 })).toEqual([
      { row: 'B', column: 7 },
      { row: 'C', column: 7 },
      { row: 'D', column: 7 },
    ]);
  });

  it('rejects diagonal cluster runs', () => {
    expect(() => linearGridRun({ row: 'A', column: 1 }, { row: 'C', column: 3 })).toThrow(
      'horizontal or vertical',
    );
  });
});
