import { describe, expect, it } from 'vitest';

import {
  pointInPolygon,
  rectsOverlap,
} from '@/modules/spatial/domain/geometry';
import {
  generateAssignableSlots,
  validatePlacement,
} from '@/modules/spatial/domain/placement';

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

    expect(
      validatePlacement({ x: 300, y: 0, width: 600, depth: 600 }, room, occupied),
    ).toContain('COLLISION');

    expect(generateAssignableSlots(room, occupied)).toHaveLength(5);
  });
});
