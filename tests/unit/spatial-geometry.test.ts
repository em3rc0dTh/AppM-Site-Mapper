import { describe, expect, it } from 'vitest';

import {
  isInPositiveDrawingPlane,
  parsePolygon,
  pointInPolygon,
  polygonsOverlapArea,
  rectInsidePolygon,
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
      { x: 0, y: 0 },
      { x: 1800, y: 0 },
      { x: 1800, y: 1200 },
      { x: 0, y: 1200 },
    ];
    expect(rectInsidePolygon({ x: 0, y: 0, width: 1200, depth: 600 }, bay)).toBe(true);
    expect(rectInsidePolygon({ x: 600, y: 0, width: 1800, depth: 600 }, bay)).toBe(false);
  });

  it('rejects a concave footprint crossing an external notch despite inside corners', () => {
    const concaveBay = [
      { x: 0, y: 0 },
      { x: 2400, y: 0 },
      { x: 2400, y: 2400 },
      { x: 1800, y: 2400 },
      { x: 1800, y: 600 },
      { x: 600, y: 600 },
      { x: 600, y: 2400 },
      { x: 0, y: 2400 },
    ];
    expect(rectInsidePolygon({ x: 300, y: 300, width: 1800, depth: 600 }, concaveBay)).toBe(false);
  });
});

describe('Canonical nonnegative drawing plane', () => {
  const boundary = [
    { x: 0, y: 0 },
    { x: 1200, y: 0 },
    { x: 1200, y: 1200 },
    { x: 0, y: 1200 },
  ];

  it('accepts a polygon on the canonical origin', () => {
    expect(parsePolygon(boundary)).toEqual(boundary);
    expect(isInPositiveDrawingPlane({ x: 0, y: 0 })).toBe(true);
  });

  it('rejects a negative vertex from Site, Structure, or Room API boundaries', () => {
    expect(parsePolygon(boundary.map((p, i) => (i === 0 ? { ...p, x: -1 } : p)))).toBeNull();
    expect(parsePolygon(boundary.map((p, i) => (i === 1 ? { ...p, y: -0.01 } : p)))).toBeNull();
  });

  it('rejects a raw negative click before snapping it to the A-1 origin', () => {
    expect(isInPositiveDrawingPlane({ x: -0.5, y: 0 })).toBe(false);
    expect(isInPositiveDrawingPlane({ x: 0, y: -0.5 })).toBe(false);
    expect(isInPositiveDrawingPlane({ x: 0.1, y: 0.1 })).toBe(true);
  });
});

describe('Room-to-Room surveyed surface overlap', () => {
  const room = [
    { x: 0, y: 0 },
    { x: 2400, y: 0 },
    { x: 2400, y: 2400 },
    { x: 0, y: 2400 },
  ];
  it('detects partially overlapping, axis-aligned rectangles sharing top and bottom edges', () => {
    expect(
      polygonsOverlapArea(room, [
        { x: 1200, y: 0 },
        { x: 3600, y: 0 },
        { x: 3600, y: 2400 },
        { x: 1200, y: 2400 },
      ]),
    ).toBe(true);
  });
  it('allows adjacent Rooms sharing a boundary but having no common surface area', () => {
    expect(
      polygonsOverlapArea(room, [
        { x: 2400, y: 0 },
        { x: 4800, y: 0 },
        { x: 4800, y: 2400 },
        { x: 2400, y: 2400 },
      ]),
    ).toBe(false);
  });
  it('detects coincident Rooms including concave polygon boundaries', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 3600, y: 0 },
      { x: 3600, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 3600 },
      { x: 0, y: 3600 },
    ];
    expect(polygonsOverlapArea(concave, concave)).toBe(true);
  });
});
