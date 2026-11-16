import { describe, expect, it } from 'vitest';

import type { NetworkNode, SiteNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const network: NetworkNode = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'NETWORK',
  parentId: null,
  name: 'Primary network',
  lifecycle: 'ACTIVE',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

const site: SiteNode = {
  id: '00000000-0000-4000-8000-000000000002',
  kind: 'SITE',
  parentId: network.id,
  name: 'Site A',
  lifecycle: 'ACTIVE',
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

describe('TopologyRepository contract', () => {
  it('persists and queries hierarchy through the repository boundary', async () => {
    const repository = new MemoryTopologyRepository();

    await repository.insert(network);
    await repository.insert(site);

    expect(await repository.getById(site.id)).toEqual(site);
    expect(await repository.listChildren(network.id)).toEqual([site]);
    expect(await repository.listByKind('SITE')).toEqual([site]);
  });

  it('rejects duplicate identities', async () => {
    const repository = new MemoryTopologyRepository([network]);

    await expect(repository.insert(network)).rejects.toThrow('already exists');
  });
});
