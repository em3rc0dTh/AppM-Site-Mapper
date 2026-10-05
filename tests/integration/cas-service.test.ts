import { describe, expect, it } from 'vitest';

import { CasService } from '@/modules/rack/application/cas-service';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-22T00:00:00.000Z';

const rack: ContainerRackNode = {
  id: 'rack-1',
  kind: 'CONTAINER_RACK',
  parentId: 'position-1',
  name: 'Rack 1',
  lifecycle: 'ACTIVE',
  variant: 'RACK',
  totalU: 42,
  cas: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const device: DeviceNode = {
  id: 'device-1',
  kind: 'DEVICE',
  parentId: rack.id,
  name: 'BDFB A',
  lifecycle: 'ACTIVE',
  pinned: false,
  deviceType: 'BDFB',
  rootEquipmentIds: ['equipment-1'],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const equipment: EquipmentNode = {
  id: 'equipment-1',
  kind: 'EQUIPMENT',
  parentId: device.id,
  deviceId: device.id,
  name: 'BDFB Chassis',
  equipmentType: 'CHASSIS',
  parentEquipmentId: null,
  childMode: 'DYNAMIC',
  children: [],
  accessPorts: [],
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('CasService', () => {
  it('persists reserve/equip/free transitions on physical Equipment', async () => {
    const repository = new MemoryTopologyRepository([rack, device, equipment]);
    const service = new CasService(repository);

    const reserved = await service.reserve(rack.id, { mountStartU: 20, physicalSizeU: 3 });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) throw new Error('Expected reservation.');

    const allocation = reserved.value.cas.find((range) => range.state === 'RESERVED');
    expect(allocation).toBeDefined();

    const equipped = await service.equip(rack.id, allocation!.id, equipment.id);
    expect(equipped.ok).toBe(true);

    const mounted = await repository.getById(equipment.id);
    expect(mounted?.kind === 'EQUIPMENT' ? mounted.rackPlacement?.rackId : null).toBe(rack.id);

    const freed = await service.free(rack.id, allocation!.id);
    expect(freed.ok).toBe(true);
    if (!freed.ok) throw new Error('Expected free.');

    expect(freed.value.cas).toHaveLength(1);
    expect(freed.value.cas[0]).toMatchObject({ startU: 1, endU: 42, state: 'AVAILABLE' });

    const released = await repository.getById(equipment.id);
    expect(released?.kind === 'EQUIPMENT' ? released.rackPlacement : null).toBeUndefined();
  });
});
