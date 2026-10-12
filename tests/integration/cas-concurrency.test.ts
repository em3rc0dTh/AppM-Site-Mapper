import { describe, expect, it } from 'vitest';

import { CasService } from '@/modules/rack/application/cas-service';
import { initializeCas } from '@/modules/rack/domain/cas';
import type { ContainerRackNode, TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const stamp = '2026-10-12T09:00:00.000Z';

function rack(): ContainerRackNode {
  return {
    id: 'rack-1',
    kind: 'CONTAINER_RACK',
    variant: 'RACK',
    parentId: 'position-1',
    name: 'RACK-EATON-01',
    totalU: 42,
    cas: initializeCas(42),
    lifecycle: 'ACTIVE',
    createdAt: stamp,
    updatedAt: stamp,
  };
}

class ConcurrentChangeRepository extends MemoryTopologyRepository {
  private injected = false;

  override async commitLayout(
    before: readonly TopologyNode[],
    after: readonly TopologyNode[],
  ): Promise<boolean> {
    if (!this.injected) {
      this.injected = true;
      const current = await this.getById('rack-1');
      if (current?.kind === 'CONTAINER_RACK') {
        await super.replace({ ...current, updatedAt: '2026-10-12T09:00:01.000Z' });
      }
    }
    return super.commitLayout(before, after);
  }
}

describe('CAS concurrency integrity', () => {
  it('rejects a stale concurrent reservation rather than overwriting the new rack version', async () => {
    const repository = new ConcurrentChangeRepository([rack()]);
    const service = new CasService(repository);
    const result = await service.reserve('rack-1', { mountStartU: 2, physicalSizeU: 1 });
    expect(result).toEqual({ ok: false, error: 'CAS_WRITE_CONFLICT' });
    const stored = await repository.getById('rack-1');
    expect(stored?.updatedAt).toBe('2026-10-12T09:00:01.000Z');
    if (stored?.kind === 'CONTAINER_RACK') {
      expect(stored.cas).toHaveLength(1);
      expect(stored.cas[0]?.state).toBe('AVAILABLE');
    }
  });

  it('uses the same guarded commit for releasing an unoccupied reservation', async () => {
    const repository = new MemoryTopologyRepository([rack()]);
    const service = new CasService(repository);
    const reservation = await service.reserve('rack-1', {
      mountStartU: 8,
      physicalSizeU: 2,
    });
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) return;
    const reserved = reservation.value.cas.find((range) => range.state === 'RESERVED');
    expect(reserved).toBeTruthy();
    if (!reserved) return;
    const released = await service.free('rack-1', reserved.id);
    expect(released.ok).toBe(true);
    if (released.ok) {
      expect(released.value.cas).toHaveLength(1);
      expect(released.value.cas[0]?.state).toBe('AVAILABLE');
    }
  });
});
