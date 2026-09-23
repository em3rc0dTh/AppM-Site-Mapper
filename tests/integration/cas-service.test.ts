import { describe, expect, it } from 'vitest';

import { CasService } from '@/modules/rack/application/cas-service';
import type { ContainerRackNode, DeviceNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const rack: ContainerRackNode = {
  id: 'rack-1',
  kind: 'CONTAINER_RACK',
  parentId: 'position-1',
  name: 'Rack 1',
  lifecycle: 'ACTIVE',
  variant: 'RACK',
  totalU: 42,
  cas: [],
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

const device: DeviceNode = {
  id: 'device-1',
  kind: 'DEVICE',
  parentId: rack.id,
  name: 'BDFB A',
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

describe('CasService', () => {
  it('persists reserve/equip/free transitions through the rack aggregate', async () => {
    const repository = new MemoryTopologyRepository([rack, device]);
    const service = new CasService(repository);

    const reserved = await service.reserve(rack.id, { mountStartU: 20, physicalSizeU: 3 });

    expect(reserved.ok).toBe(true);

    if (!reserved.ok) {
      throw new Error('Expected reservation.');
    }

    const allocation = reserved.value.cas.find((range) => range.state === 'RESERVED');
    expect(allocation).toBeDefined();

    const equipped = await service.equip(rack.id, allocation!.id, device.id);
    expect(equipped.ok).toBe(true);

    const freed = await service.free(rack.id, allocation!.id);
    expect(freed.ok).toBe(true);

    if (!freed.ok) {
      throw new Error('Expected free.');
    }

    expect(freed.value.cas).toHaveLength(1);
    expect(freed.value.cas[0]).toMatchObject({ startU: 1, endU: 42, state: 'AVAILABLE' });
  });
});
