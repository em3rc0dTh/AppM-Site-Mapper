import { describe, expect, it } from 'vitest';

import { StructureAuthoringService } from '@/modules/spatial/application/structure-authoring-service';
import type { NetworkNode, SiteNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-24T00:00:00.000Z';

const network: NetworkNode = {
  id: '00000000-0000-4000-8000-000000000201',
  kind: 'NETWORK',
  parentId: null,
  name: 'Network',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const site: SiteNode = {
  id: '00000000-0000-4000-8000-000000000202',
  kind: 'SITE',
  parentId: network.id,
  name: 'Site',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
  polygon: [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 0, y: 4000 },
  ],
};

describe('StructureAuthoringService', () => {
  it('creates a Structure with an authoritative persisted footprint', async () => {
    const repository = new MemoryTopologyRepository([network, site]);
    const result = await new StructureAuthoringService(repository).create({
      parentId: site.id,
      name: 'Building A',
      polygon: [
        { x: 500, y: 500 },
        { x: 2500, y: 500 },
        { x: 2500, y: 2000 },
        { x: 500, y: 2000 },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const persisted = await repository.getById(result.value.id);
    expect(persisted?.kind).toBe('STRUCTURE');
    expect(persisted?.kind === 'STRUCTURE' ? persisted.polygon : undefined).toEqual([
      { x: 500, y: 500 },
      { x: 2500, y: 500 },
      { x: 2500, y: 2000 },
      { x: 500, y: 2000 },
    ]);
  });

  it('rejects an outside footprint before creating a topology node', async () => {
    const repository = new MemoryTopologyRepository([network, site]);
    const result = await new StructureAuthoringService(repository).create({
      parentId: site.id,
      name: 'Outside building',
      polygon: [
        { x: 4500, y: 500 },
        { x: 5500, y: 500 },
        { x: 5500, y: 1500 },
        { x: 4500, y: 1500 },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'BOUNDARY_OUTSIDE_PARENT' });
    expect(await repository.listChildren(site.id)).toHaveLength(0);
  });

  it('allows topology-first creation when the footprint will be drawn later', async () => {
    const repository = new MemoryTopologyRepository([network, site]);
    const result = await new StructureAuthoringService(repository).create({
      parentId: site.id,
      name: 'Irregular building',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.polygon).toBeUndefined();
  });
});
