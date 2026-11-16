import { describe, expect, it } from 'vitest';

import {
  prepareLayoutSave,
  readLayoutDraft,
} from '@/modules/spatial/application/layout-editor-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

function rect(x: number, y: number, width: number, height: number) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

async function fixture() {
  const repo = new MemoryTopologyRepository();
  const topology = new TopologyService(repo);
  const network = await topology.create({ kind: 'NETWORK', parentId: null, name: 'Network' });
  if (!network.ok) throw new Error(network.error);
  const site = await topology.create({
    kind: 'SITE',
    parentId: network.value.id,
    name: 'Site',
    polygon: rect(0, 0, 12000, 12000),
  });
  if (!site.ok) throw new Error(site.error);
  const building = await topology.create({
    kind: 'STRUCTURE',
    parentId: site.value.id,
    name: 'Building',
    polygon: rect(0, 0, 6000, 6000),
  });
  if (!building.ok) throw new Error(building.error);
  const level = await topology.create({
    kind: 'LEVEL',
    parentId: building.value.id,
    name: 'Level 01',
  });
  if (!level.ok) throw new Error(level.error);
  const levelId = level.value.id;
  async function createRoom(name: string, polygon: ReturnType<typeof rect>) {
    return topology.create({
      kind: 'ROOM_SUBSTRUCTURE',
      roomVariant: 'ROOM',
      parentId: levelId,
      name,
      polygon,
    });
  }
  return { repo, topology, level: level.value, createRoom };
}

describe('Level Room physical space constraints', () => {
  it('rejects overlapping Rooms at creation instead of persisting two spaces on top of each other', async () => {
    const { createRoom } = await fixture();
    expect((await createRoom('Sala 01', rect(0, 0, 2400, 2400))).ok).toBe(true);
    expect(await createRoom('Sala superpuesta', rect(1200, 0, 2400, 2400))).toEqual({
      ok: false,
      error: 'ROOM_OVERLAP',
    });
  });

  it('allows adjacent Rooms that share a wall but not surface area', async () => {
    const { createRoom } = await fixture();
    expect((await createRoom('Sala 01', rect(0, 0, 2400, 2400))).ok).toBe(true);
    expect((await createRoom('Sala 02', rect(2400, 0, 2400, 2400))).ok).toBe(true);
  });

  it('rejects Room geometry outside the Level parent Structure survey', async () => {
    const { createRoom } = await fixture();
    expect(await createRoom('Outside Building', rect(5400, 0, 1200, 1200))).toEqual({
      ok: false,
      error: 'ROOM_OUTSIDE_STRUCTURE',
    });
  });

  it('rejects editing a Room into a sibling Room and does not mutate stored data', async () => {
    const { repo, createRoom } = await fixture();
    const first = await createRoom('Sala 01', rect(0, 0, 2400, 2400));
    const second = await createRoom('Sala 02', rect(2400, 0, 2400, 2400));
    if (!first.ok || !second.ok) throw new Error('fixture setup failed');
    const existing = await readLayoutDraft(repo, second.value.id);
    if (!existing) throw new Error('No room layout');
    const attempt = await prepareLayoutSave(repo, second.value.id, {
      ...existing.draft,
      polygon: rect(1200, 0, 2400, 2400),
    });
    expect(attempt).toEqual({ error: 'ROOM_OVERLAP' });
    const stored = await repo.getById(second.value.id);
    expect(stored?.kind === 'ROOM_SUBSTRUCTURE' ? stored.polygon : null).toEqual(
      rect(2400, 0, 2400, 2400),
    );
  });

  it('rejects edited Room boundary escaping Structure coordinates', async () => {
    const { repo, createRoom } = await fixture();
    const first = await createRoom('Sala 01', rect(0, 0, 2400, 2400));
    if (!first.ok) throw new Error('fixture setup failed');
    const current = await readLayoutDraft(repo, first.value.id);
    if (!current) throw new Error('No room layout');
    expect(
      await prepareLayoutSave(repo, first.value.id, {
        ...current.draft,
        polygon: rect(4800, 0, 2400, 2400),
      }),
    ).toEqual({ error: 'ROOM_OUTSIDE_STRUCTURE' });
  });
});
