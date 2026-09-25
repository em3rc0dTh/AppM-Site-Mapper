import { describe, expect, it } from 'vitest';

import type { PowerPath } from '@/modules/power/domain/entities';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { NetworkNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-25T00:00:00.000Z';

describe('optimistic concurrency', () => {
  it('rejects a stale topology replacement', async () => {
    const original: NetworkNode = {
      id: 'network-1',
      kind: 'NETWORK',
      parentId: null,
      name: 'Network',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 0,
    };
    const repository = new MemoryTopologyRepository([original]);

    expect(
      await repository.replace(
        { ...original, name: 'Network A', revision: 1, updatedAt: '2026-09-25T00:00:01.000Z' },
        0,
      ),
    ).toBe(true);

    expect(
      await repository.replace(
        { ...original, name: 'Stale write', revision: 1, updatedAt: '2026-09-25T00:00:02.000Z' },
        0,
      ),
    ).toBe(false);

    expect((await repository.getById(original.id))?.name).toBe('Network A');
  });

  it('rejects a stale PowerPath replacement', async () => {
    const original: PowerPath = {
      id: 'path-1',
      sourceEntityId: 'source',
      targetEntityId: 'target',
      source: { entityId: 'source' },
      target: { entityId: 'target' },
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 0,
    };
    const repository = new MemoryPowerRepository([original]);

    expect(
      await repository.replace(
        { ...original, lifecycle: 'ARCHIVED', revision: 1, updatedAt: '2026-09-25T00:00:01.000Z' },
        0,
      ),
    ).toBe(true);

    expect(
      await repository.replace(
        { ...original, label: 'stale', revision: 1, updatedAt: '2026-09-25T00:00:02.000Z' },
        0,
      ),
    ).toBe(false);
  });

  it('treats legacy aggregates without revision as revision zero', async () => {
    const legacy: NetworkNode = {
      id: 'legacy-network',
      kind: 'NETWORK',
      parentId: null,
      name: 'Legacy',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const repository = new MemoryTopologyRepository([legacy]);

    expect(
      await repository.replace(
        { ...legacy, name: 'Migrated', revision: 1, updatedAt: '2026-09-25T00:00:01.000Z' },
        0,
      ),
    ).toBe(true);
  });
});
