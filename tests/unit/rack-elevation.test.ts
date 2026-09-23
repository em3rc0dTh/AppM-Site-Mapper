import { describe, expect, it } from 'vitest';

import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const rack: ContainerRackNode = {
  id: 'rack-1',
  kind: 'CONTAINER_RACK',
  parentId: 'position-1',
  name: 'Rack 1',
  lifecycle: 'ACTIVE',
  variant: 'RACK',
  totalU: 6,
  cas: [
    { id: 'available-1', startU: 1, endU: 1, state: 'AVAILABLE' },
    {
      id: 'allocation-1',
      startU: 2,
      endU: 5,
      state: 'EQUIPPED',
      mountStartU: 3,
      physicalSizeU: 2,
      clearanceBottomU: 1,
      clearanceTopU: 1,
      occupantId: 'device-1',
    },
    { id: 'available-2', startU: 6, endU: 6, state: 'AVAILABLE' },
  ],
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

const device: DeviceNode = {
  id: 'device-1',
  kind: 'DEVICE',
  parentId: rack.id,
  name: 'Device A',
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

const equipment: EquipmentNode = {
  id: 'equipment-1',
  kind: 'EQUIPMENT',
  parentId: rack.id,
  name: 'Equipment A',
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

describe('RackElevationService', () => {
  it('renders Device and Equipment as sibling rack inventory while projecting CAS by U', async () => {
    const repository = new MemoryTopologyRepository([rack, device, equipment]);
    const result = await new RackElevationService(repository).getView(rack.id);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected rack elevation.');
    }

    expect(result.value.inventory.map((item) => item.kind).sort()).toEqual(['DEVICE', 'EQUIPMENT']);
    expect(result.value.rows).toHaveLength(6);
    expect(result.value.rows.find((row) => row.u === 3)).toMatchObject({
      role: 'PHYSICAL',
      occupant: { id: device.id, kind: 'DEVICE' },
    });
    expect(result.value.rows.find((row) => row.u === 2)).toMatchObject({
      role: 'CLEARANCE',
    });
  });
});
