import { describe, expect, it } from 'vitest';

import { pointInPolygon, rectsOverlap } from '@/modules/spatial/domain/geometry';
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


describe('multi-cell rack footprints inside concave bays', () => {
  it('permits a wider-than-600 mm footprint within a verified bay', () => {
    const bay = [
      { x: 0, y: 0 }, { x: 1800, y: 0 }, { x: 1800, y: 1200 }, { x: 0, y: 1200 },
    ];
    expect(rectInsidePolygon({ x: 0, y: 0, width: 1200, depth: 600 }, bay)).toBe(true);
    expect(rectInsidePolygon({ x: 600, y: 0, width: 1800, depth: 600 }, bay)).toBe(false);
  });

  it('rejects a concave footprint crossing an external notch despite inside corners', () => {
    const concaveBay = [
      { x: 0, y: 0 }, { x: 2400, y: 0 }, { x: 2400, y: 2400 },
      { x: 1800, y: 2400 }, { x: 1800, y: 600 }, { x: 600, y: 600 },
      { x: 600, y: 2400 }, { x: 0, y: 2400 },
    ];
    expect(rectInsidePolygon({ x: 300, y: 300, width: 1800, depth: 600 }, concaveBay)).toBe(false);
  });
});
