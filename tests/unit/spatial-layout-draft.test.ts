import { describe, expect, it } from 'vitest';

import {
  findNextRackCoordinate,
  validateLayoutDraft,
  type LayoutDraft,
} from '@/modules/spatial/domain/layout-draft';

function baseDraft(): LayoutDraft {
  return {
    version: '2026-09-30T19:00:00.000Z',
    polygon: [
      { x: 0, y: 0 },
      { x: 3600, y: 0 },
      { x: 3600, y: 3600 },
      { x: 0, y: 3600 },
    ],
    clusters: [
      {
        id: 'bay-top',
        name: 'Bay Top',
        variant: 'BAY',
        polygon: [
          { x: 0, y: 0 },
          { x: 1200, y: 0 },
          { x: 1200, y: 600 },
          { x: 0, y: 600 },
        ],
      },
      {
        id: 'bay-below',
        name: 'Bay Below',
        variant: 'BAY',
        polygon: [
          { x: 0, y: 1200 },
          { x: 1200, y: 1200 },
          { x: 1200, y: 1800 },
          { x: 0, y: 1800 },
        ],
      },
    ],
    positions: [],
    racks: [],
  };
}

describe('Bay frontage and downstream rack depth', () => {
  it('packs two 600 mm racks left-to-right in a 1200 mm bay', () => {
    const draft = baseDraft();
    const first = findNextRackCoordinate(draft, 'bay-top', 600, 900);
    expect(first).toEqual({ row: 'A', column: 1 });

    draft.positions.push({
      id: 'p1',
      name: 'Rack 1 anchor',
      clusterId: 'bay-top',
      ...first!,
    });
    draft.racks.push({
      id: 'r1',
      name: 'Rack 1',
      positionId: 'p1',
      width: 600,
      depth: 900,
      totalU: 42,
    });

    const second = findNextRackCoordinate(draft, 'bay-top', 600, 900);
    expect(second).toEqual({ row: 'A', column: 2 });

    draft.positions.push({
      id: 'p2',
      name: 'Rack 2 anchor',
      clusterId: 'bay-top',
      ...second!,
    });
    draft.racks.push({
      id: 'r2',
      name: 'Rack 2',
      positionId: 'p2',
      width: 600,
      depth: 900,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBeNull();
  });

  it('allows one 900 mm rack but cannot fit a second 900 mm rack in 1200 mm frontage', () => {
    const draft = baseDraft();
    const first = findNextRackCoordinate(draft, 'bay-top', 900, 900);
    expect(first).toEqual({ row: 'A', column: 1 });

    draft.positions.push({
      id: 'p1',
      name: 'Wide rack anchor',
      clusterId: 'bay-top',
      ...first!,
    });
    draft.racks.push({
      id: 'r1',
      name: 'Wide rack',
      positionId: 'p1',
      width: 900,
      depth: 900,
      totalU: 42,
    });

    expect(findNextRackCoordinate(draft, 'bay-top', 900, 900)).toBeNull();
    expect(validateLayoutDraft(draft)).toBeNull();
  });

  it('allows rack depth to extend below the bay while room and downstream clearance remain free', () => {
    for (const depth of [900, 1200]) {
      const draft = baseDraft();
      const coordinate = findNextRackCoordinate(draft, 'bay-top', 600, depth);
      expect(coordinate).toEqual({ row: 'A', column: 1 });

      draft.positions.push({
        id: `p-${depth}`,
        name: 'Depth anchor',
        clusterId: 'bay-top',
        ...coordinate!,
      });
      draft.racks.push({
        id: `r-${depth}`,
        name: `Rack ${depth}`,
        positionId: `p-${depth}`,
        width: 600,
        depth,
        totalU: 42,
      });

      expect(validateLayoutDraft(draft)).toBeNull();
    }
  });

  it('rejects 1500 mm depth when it intrudes into a bay after one 600 mm clearance row', () => {
    const draft = baseDraft();
    draft.positions.push({
      id: 'p1',
      name: 'Deep rack anchor',
      clusterId: 'bay-top',
      row: 'A',
      column: 1,
    });
    draft.racks.push({
      id: 'r1',
      name: 'Deep rack',
      positionId: 'p1',
      width: 600,
      depth: 1500,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBe('RACK_DEPTH_BLOCKED_BY_BAY');
    expect(findNextRackCoordinate(baseDraft(), 'bay-top', 600, 1500)).toBeNull();
  });

  it('rejects a rack whose width crosses the bay X frontage', () => {
    const draft = baseDraft();
    draft.positions.push({
      id: 'p1',
      name: 'Too wide anchor',
      clusterId: 'bay-top',
      row: 'A',
      column: 1,
    });
    draft.racks.push({
      id: 'r1',
      name: 'Too wide',
      positionId: 'p1',
      width: 1500,
      depth: 900,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBe('RACK_OUTSIDE_BAY_WIDTH');
  });

  it('still rejects depth that leaves the Room even when Bay frontage is valid', () => {
    const draft = baseDraft();
    draft.clusters = draft.clusters.filter((cluster) => cluster.id === 'bay-top');
    draft.positions.push({
      id: 'p1',
      name: 'Room overflow anchor',
      clusterId: 'bay-top',
      row: 'A',
      column: 1,
    });
    draft.racks.push({
      id: 'r1',
      name: 'Room overflow',
      positionId: 'p1',
      width: 600,
      depth: 4200,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBe('RACK_OUTSIDE_ROOM');
  });
});
