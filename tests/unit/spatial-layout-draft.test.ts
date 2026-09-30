import { describe, expect, it } from 'vitest';

import {
  findNextRackPlacement,
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

function addRack(
  draft: LayoutDraft,
  id: string,
  name: string,
  width: number,
  depth: number,
  clusterId = 'bay-top',
) {
  const placement = findNextRackPlacement(draft, clusterId, width, depth);
  if (!placement) throw new Error('Expected a valid rack placement.');

  const positionId = `p-${id}`;
  draft.positions.push({
    id: positionId,
    name: `${name} anchor`,
    clusterId,
    ...placement.coordinate,
  });
  draft.racks.push({
    id,
    name,
    positionId,
    x: placement.point.x,
    y: placement.point.y,
    width,
    depth,
    totalU: 42,
  });

  return placement;
}

describe('Bay frontage and downstream rack depth', () => {
  it('packs two 600 mm racks left-to-right in a 1200 mm bay', () => {
    const draft = baseDraft();
    expect(addRack(draft, 'r1', 'Rack 1', 600, 900).point).toEqual({ x: 0, y: 0 });
    expect(addRack(draft, 'r2', 'Rack 2', 600, 900).point).toEqual({ x: 600, y: 0 });
    expect(validateLayoutDraft(draft)).toBeNull();
  });

  it('allows one 900 mm rack but cannot fit a second 900 mm rack in 1200 mm frontage', () => {
    const draft = baseDraft();
    expect(addRack(draft, 'r1', 'Wide rack', 900, 900).point).toEqual({ x: 0, y: 0 });
    expect(findNextRackPlacement(draft, 'bay-top', 900, 900)).toBeNull();
    expect(validateLayoutDraft(draft)).toBeNull();
  });

  it('packs two 900 mm racks completely flush when Bay frontage is 1800 mm', () => {
    const draft = baseDraft();
    draft.clusters[0] = {
      ...draft.clusters[0]!,
      polygon: [
        { x: 0, y: 0 },
        { x: 1800, y: 0 },
        { x: 1800, y: 600 },
        { x: 0, y: 600 },
      ],
    };

    expect(addRack(draft, 'r1', 'Rack 1', 900, 900).point).toEqual({ x: 0, y: 0 });
    const second = addRack(draft, 'r2', 'Rack 2', 900, 900);
    expect(second.point).toEqual({ x: 900, y: 0 });
    expect(second.coordinate).toEqual({ row: 'A', column: 2 });
    expect(validateLayoutDraft(draft)).toBeNull();
  });

  it('allows rack depth to extend below the Bay while Room and downstream clearance remain free', () => {
    for (const depth of [900, 1200]) {
      const draft = baseDraft();
      expect(addRack(draft, `r-${depth}`, `Rack ${depth}`, 600, depth).point).toEqual({
        x: 0,
        y: 0,
      });
      expect(validateLayoutDraft(draft)).toBeNull();
    }
  });

  it('rejects 1500 mm depth when it intrudes into a Bay after one 600 mm clearance row', () => {
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
      x: 0,
      y: 0,
      width: 600,
      depth: 1500,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBe('RACK_DEPTH_BLOCKED_BY_BAY');
    expect(findNextRackPlacement(baseDraft(), 'bay-top', 600, 1500)).toBeNull();
  });

  it('rejects a rack whose width crosses the Bay X frontage', () => {
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
      x: 0,
      y: 0,
      width: 1500,
      depth: 900,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBe('RACK_OUTSIDE_BAY_WIDTH');
  });

  it('packs 1200 mm racks flush across two grid cells each', () => {
    const draft = baseDraft();
    draft.clusters[0] = {
      ...draft.clusters[0]!,
      polygon: [
        { x: 0, y: 0 },
        { x: 2400, y: 0 },
        { x: 2400, y: 600 },
        { x: 0, y: 600 },
      ],
    };

    expect(addRack(draft, 'r1', 'Rack 1', 1200, 900).point).toEqual({ x: 0, y: 0 });
    const second = addRack(draft, 'r2', 'Rack 2', 1200, 900);
    expect(second.point).toEqual({ x: 1200, y: 0 });
    expect(second.coordinate).toEqual({ row: 'A', column: 3 });
    expect(validateLayoutDraft(draft)).toBeNull();
  });

  it('rejects duplicate rack names in the same Room draft', () => {
    const draft = baseDraft();
    draft.positions.push(
      { id: 'p1', name: 'Rack 1 anchor', clusterId: 'bay-top', row: 'A', column: 1 },
      { id: 'p2', name: 'Rack 2 anchor', clusterId: 'bay-top', row: 'A', column: 2 },
    );
    draft.racks.push(
      {
        id: 'r1',
        name: 'RACK-EATON-01',
        positionId: 'p1',
        x: 0,
        y: 0,
        width: 600,
        depth: 900,
        totalU: 42,
      },
      {
        id: 'r2',
        name: 'rack-eaton-01',
        positionId: 'p2',
        x: 600,
        y: 0,
        width: 600,
        depth: 900,
        totalU: 42,
      },
    );

    expect(validateLayoutDraft(draft)).toBe('DUPLICATE_RACK_NAME');
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
      x: 0,
      y: 0,
      width: 600,
      depth: 4200,
      totalU: 42,
    });

    expect(validateLayoutDraft(draft)).toBe('RACK_OUTSIDE_ROOM');
  });
});
