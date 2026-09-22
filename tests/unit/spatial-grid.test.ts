import { describe, expect, it } from 'vitest';

import { gridCoordinateToPoint, snapToGrid, TILE_SIZE_MM } from '@/modules/spatial/domain/grid';

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
});
