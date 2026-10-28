import { describe, expect, it } from 'vitest';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { reflowForBdfb } from '@/modules/spatial/application/bdfb-automatic-placement';
import { validateLayoutDraft, type LayoutDraft } from '@/modules/spatial/domain/layout-draft';

const at = '2026-10-28T10:00:00.000Z';
const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

function draft(): LayoutDraft {
  return {
    version: at,
    polygon: rect(0, 0, 3600, 3600),
    clusters: [{ id: 'bay', name: 'Bay', variant: 'BAY', polygon: rect(0, 0, 2400, 600) }],
    positions: [1, 2, 3].map((i) => ({
      id: 'p' + i,
      name: 'Anchor ' + i,
      clusterId: 'bay',
      row: 'A',
      column: i,
    })),
    racks: [1, 2, 3].map((i) => ({
      id: 'r' + i,
      name: 'Rack ' + i,
      positionId: 'p' + i,
      x: (i - 1) * 600,
      y: 0,
      width: 600,
      depth: 900,
      totalU: 42,
      placementState: 'AUTO_PROVISIONAL',
    })),
  };
}

function seed(layout = draft()): TopologyNode[] {
  const common = { lifecycle: 'ACTIVE' as const, createdAt: at, updatedAt: at };
  return [
    { ...common, kind: 'NETWORK', id: 'network', parentId: null, name: 'Network' },
    {
      ...common,
      kind: 'SITE',
      id: 'site',
      parentId: 'network',
      name: 'Site',
      polygon: rect(0, 0, 3600, 3600),
    },
    {
      ...common,
      kind: 'STRUCTURE',
      id: 'structure',
      parentId: 'site',
      name: 'Structure',
      polygon: rect(0, 0, 3600, 3600),
    },
    { ...common, kind: 'LEVEL', id: 'level', parentId: 'structure', name: 'Level' },
    {
      ...common,
      kind: 'ROOM_SUBSTRUCTURE',
      id: 'room',
      parentId: 'level',
      name: 'Room',
      variant: 'ROOM',
      polygon: layout.polygon,
    },
    ...layout.clusters.map((item): TopologyNode => ({
      ...common,
      kind: 'CONTAINER_CLUSTER_BAY',
      id: item.id,
      name: item.name,
      parentId: 'room',
      variant: 'BAY',
      polygon: item.polygon,
    })),
    ...layout.positions.map((item): TopologyNode => ({
      ...common,
      kind: 'POSITION',
      id: item.id,
      parentId: item.clusterId,
      name: item.name,
      coordinate: { row: item.row, column: item.column },
    })),
    ...layout.racks.map((item): TopologyNode => ({
      ...common,
      kind: 'CONTAINER_RACK',
      id: item.id,
      parentId: item.positionId,
      name: item.name,
      variant: 'RACK',
      placementMm: { x: item.x, y: item.y },
      dimensionsMm: { width: item.width, depth: item.depth },
      totalU: 42,
      cas: [],
      ...(item.placementState ? { placementState: item.placementState } : {}),
    })),
  ];
}

describe('BDFB-PHYS-001', () => {
  it('reserves the rightmost bay slot for BDFB without renaming or moving other identities', () => {
    const input = draft();
    const result = reflowForBdfb(input, 'r2', new Set(['r1', 'r2', 'r3']));
    expect(result).not.toBeNull();
    expect(result!.racks.find((r) => r.id === 'r2')).toMatchObject({
      x: 1800,
      placementState: 'CONFIRMED',
    });
    expect(result!.racks.find((r) => r.id === 'r1')?.x).toBe(0);
    expect(result!.racks.find((r) => r.id === 'r3')?.x).toBe(600);
    expect(result!.positions.find((p) => p.id === 'p2')?.column).toBe(4);
    expect(validateLayoutDraft(result)).toBeNull();
    expect(input.racks.find((r) => r.id === 'r2')?.x).toBe(600);
  });

  it('never moves a confirmed or historical rack and refuses a non-provisional BDFB target', () => {
    const input = draft();
    input.racks[0] = { ...input.racks[0]!, placementState: 'CONFIRMED' };
    delete input.racks[2]!.placementState;
    const result = reflowForBdfb(input, 'r2', new Set(['r2']));
    expect(result!.racks.find((r) => r.id === 'r1')?.x).toBe(0);
    expect(result!.racks.find((r) => r.id === 'r3')?.x).toBe(1200);
    expect(reflowForBdfb(input, 'r1', new Set(['r1', 'r2', 'r3']))).toBeNull();
  });

  it('creates BDFB Device and moves Rack+Position atomically using the existing repository contract', async () => {
    const repo = new MemoryTopologyRepository(seed());
    const result = await new TopologyService(repo).create({
      kind: 'DEVICE',
      parentId: 'r2',
      name: 'BFDB main',
      deviceType: 'BDFB',
    });
    expect(result.ok).toBe(true);
    expect(await repo.getById('r2')).toMatchObject({
      placementMm: { x: 1800, y: 0 },
      placementState: 'CONFIRMED',
    });
    expect(await repo.getById('p2')).toMatchObject({ coordinate: { row: 'A', column: 4 } });
    expect(await repo.getById('r3')).toMatchObject({
      placementMm: { x: 600, y: 0 },
      placementState: 'AUTO_PROVISIONAL',
    });
    expect(await repo.getById('r1')).toMatchObject({ placementMm: { x: 0, y: 0 } });
    if (result.ok)
      expect(await repo.getById(result.value.id)).toMatchObject({
        deviceType: 'BDFB',
        parentId: 'r2',
      });
  });

  it('ordinary Device never triggers a rightward reflow; confirms only its rack', async () => {
    const repo = new MemoryTopologyRepository(seed());
    const result = await new TopologyService(repo).create({
      kind: 'DEVICE',
      parentId: 'r2',
      name: 'Server',
      deviceType: 'SERVER',
    });
    expect(result.ok).toBe(true);
    expect(await repo.getById('r2')).toMatchObject({
      placementMm: { x: 600, y: 0 },
      placementState: 'CONFIRMED',
    });
    expect(await repo.getById('r3')).toMatchObject({
      placementMm: { x: 1200, y: 0 },
      placementState: 'AUTO_PROVISIONAL',
    });
  });

  it('existing historical racks are protected and never retroactively reflowed', async () => {
    const existing = draft();
    delete existing.racks[0]!.placementState;
    delete existing.racks[1]!.placementState;
    const repo = new MemoryTopologyRepository(seed(existing));
    const result = await new TopologyService(repo).create({
      kind: 'DEVICE',
      parentId: 'r2',
      name: 'Existing BFDB',
      deviceType: 'BDFB',
    });
    expect(result.ok).toBe(true);
    expect(await repo.getById('r2')).toMatchObject({ placementMm: { x: 600, y: 0 } });
    expect(await repo.getById('r2')).not.toHaveProperty('placementState');
  });

  it('reflows when an existing BDFB Device is moved into a newly provisional rack', async () => {
    const initial = draft();
    delete initial.racks[0]!.placementState;
    const repo = new MemoryTopologyRepository(seed(initial));
    const service = new TopologyService(repo);
    const created = await service.create({
      kind: 'DEVICE',
      parentId: 'r1',
      name: 'Existing BFDB identity',
      deviceType: 'BDFB',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const moved = await service.move(created.value.id, 'r2');
    expect(moved.ok).toBe(true);
    expect(await repo.getById(created.value.id)).toMatchObject({ parentId: 'r2' });
    expect(await repo.getById('r2')).toMatchObject({
      placementMm: { x: 1800, y: 0 },
      placementState: 'CONFIRMED',
    });
    expect(await repo.getById('r1')).toMatchObject({ placementMm: { x: 0, y: 0 } });
  });

  it('does not write partial changes when an existing occupant blocks reflow', async () => {
    const items = seed();
    items.push({
      id: 'existing-device',
      name: 'Installed',
      kind: 'DEVICE',
      parentId: 'r2',
      deviceType: 'SERVER',
      pinned: false,
      rootEquipmentIds: [],
      lifecycle: 'ACTIVE',
      createdAt: at,
      updatedAt: at,
    });
    const repo = new MemoryTopologyRepository(items);
    const result = await new TopologyService(repo).create({
      kind: 'DEVICE',
      parentId: 'r2',
      name: 'BFDB blocked',
      deviceType: 'BDFB',
    });
    expect(result).toEqual({ ok: false, error: 'BDFB_PLACEMENT_BLOCKED' });
    expect(await repo.getById('r2')).toMatchObject({
      placementMm: { x: 600, y: 0 },
      placementState: 'AUTO_PROVISIONAL',
    });
    expect(await repo.listChildren('r2')).toHaveLength(1);
  });
});
