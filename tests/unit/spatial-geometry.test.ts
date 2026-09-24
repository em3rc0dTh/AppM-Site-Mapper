import { describe, expect, it } from 'vitest';

import {
  isValidPolygon,
  pointInPolygon,
  polygonBounds,
  polygonContainedByPolygon,
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

  it('rejects a child polygon whose edge exits a concave parent', () => {
    const concaveParent = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 },
      { x: 3000, y: 4000 },
      { x: 3000, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 4000 },
      { x: 0, y: 4000 },
    ] as const;
    const crossingChild = [
      { x: 500, y: 3000 },
      { x: 3500, y: 3000 },
      { x: 2000, y: 500 },
    ] as const;
    const containedChild = [
      { x: 250, y: 250 },
      { x: 900, y: 250 },
      { x: 900, y: 900 },
      { x: 250, y: 900 },
    ] as const;

    expect(crossingChild.every((point) => pointInPolygon(point, concaveParent))).toBe(true);
    expect(polygonContainedByPolygon(crossingChild, concaveParent)).toBe(false);
    expect(polygonContainedByPolygon(containedChild, concaveParent)).toBe(true);
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
