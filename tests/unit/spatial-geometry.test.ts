import { describe, expect, it } from 'vitest';

import {
  isValidPolygon,
  pointInPolygon,
  polygonBounds,
  polygonSelfIntersects,
  rectsOverlap,
} from '@/modules/spatial/domain/geometry';
import { generateAssignableSlots, validatePlacement } from '@/modules/spatial/domain/placement';

const room = [
  { x: -1, y: -1 },
  { x: 1801, y: -1 },
  { x: 1801, y: 1201 },
  { x: -1, y: 1201 },
] as const;

describe('Blueprint geometry', () => {
  it('evaluates polygon containment without React', () => {
    expect(pointInPolygon({ x: 300, y: 300 }, room)).toBe(true);
    expect(pointInPolygon({ x: 3000, y: 300 }, room)).toBe(false);
  });

  it('rejects self-intersecting and duplicate-vertex boundaries', () => {
    const bowTie = [
      { x: 0, y: 0 },
      { x: 1200, y: 1200 },
      { x: 0, y: 1200 },
      { x: 1200, y: 0 },
    ] as const;

    expect(polygonSelfIntersects(bowTie)).toBe(true);
    expect(isValidPolygon(bowTie)).toBe(false);
    expect(
      isValidPolygon([
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
        { x: 1200, y: 0 },
        { x: 0, y: 1200 },
      ]),
    ).toBe(false);
  });

  it('computes reusable polygon bounds', () => {
    expect(polygonBounds(room)).toEqual({
      minX: -1,
      minY: -1,
      maxX: 1801,
      maxY: 1201,
      width: 1802,
      height: 1202,
    });
  });

  it('detects rectangle collisions', () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 600, depth: 600 },
        { x: 300, y: 300, width: 600, depth: 600 },
      ),
    ).toBe(true);
  });

  it('rejects collisions and exposes empty 600 mm slots', () => {
    const occupied = [{ x: 0, y: 0, width: 600, depth: 600 }];

    expect(validatePlacement({ x: 300, y: 0, width: 600, depth: 600 }, room, occupied)).toContain(
      'COLLISION',
    );

    expect(generateAssignableSlots(room, occupied)).toHaveLength(5);
  });
});
