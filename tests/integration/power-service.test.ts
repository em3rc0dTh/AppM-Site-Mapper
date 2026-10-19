import { describe, expect, it } from 'vitest';

import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-22T00:00:00.000Z';

const device: DeviceNode = {
  id: 'device-1',
  kind: 'DEVICE',
  parentId: 'rack-1',
  name: 'BDFB A',
  lifecycle: 'ACTIVE',
  pinned: false,
  deviceType: 'BDFB',
  rootEquipmentIds: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const loadDevice: DeviceNode = {
  id: 'load-device-1',
  kind: 'DEVICE',
  parentId: 'rack-1',
  name: 'Load A',
  lifecycle: 'ACTIVE',
  pinned: false,
  deviceType: 'SERVER',
  rootEquipmentIds: ['equipment-1'],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const equipment: EquipmentNode = {
  id: 'equipment-1',
  kind: 'EQUIPMENT',
  parentId: loadDevice.id,
  deviceId: loadDevice.id,
  name: 'Load A Chassis',
  equipmentType: 'CHASSIS',
  parentEquipmentId: null,
  childMode: 'DYNAMIC',
  children: [],
  accessPorts: [
    {
      id: 'equipment-1:power-in',
      deviceId: loadDevice.id,
      equipmentId: 'equipment-1',
      name: 'Power input',
      portType: 'POWER',
      direction: 'INPUT',
      exposure: 'EXTERNAL',
      lifecycle: 'ACTIVE',
    },
  ],
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: timestamp,
  updatedAt: timestamp,
};

async function createBreaker(
  repository: MemoryTopologyRepository,
  owner: DeviceNode,
  panelName: string,
): Promise<EquipmentNode> {
  const topology = new TopologyService(repository);
  const chassis = await topology.create({
    kind: 'EQUIPMENT',
    parentId: owner.id,
    name: owner.name + ' Chassis',
    equipmentType: 'CHASSIS',
    childMode: 'POSITIONAL',
    childCapacity: 1,
  });
  if (!chassis.ok || chassis.value.kind !== 'EQUIPMENT') throw new Error('Expected chassis');

  const panel = await topology.create({
    kind: 'EQUIPMENT',
    parentId: chassis.value.id,
    parentSlotIndex: 0,
    name: panelName,
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    childCapacity: 1,
  });
  if (!panel.ok || panel.value.kind !== 'EQUIPMENT') throw new Error('Expected panel');

  const breaker = await topology.create({
    kind: 'EQUIPMENT',
    parentId: panel.value.id,
    parentSlotIndex: 0,
    name: panelName + '-01',
    equipmentType: 'CIRCUIT_BREAKER',
  });
  if (!breaker.ok || breaker.value.kind !== 'EQUIPMENT') throw new Error('Expected breaker');
  return breaker.value;
}

describe('Power domain', () => {
  it('materializes BDFB Equipment and creates an AccessPort-to-AccessPort path', async () => {
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment]);
    const breaker = await createBreaker(topology, device, 'Panel A');
    const sourceAccessPortId = breaker.id + ':power-out';
    const paths = new MemoryPowerRepository();
    const service = new PowerService(topology, paths);
    const created = await service.create({
      sourceAccessPortId,
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'A',
      label: 'Primary feed',
    });

    expect(created.ok).toBe(true);

    const duplicate = await service.create({
      sourceAccessPortId,
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'A',
      label: 'Repeated commissioning click',
    });

    expect(duplicate.ok).toBe(true);
    expect(duplicate.ok && created.ok ? duplicate.value.id : null).toBe(
      created.ok ? created.value.id : null,
    );
    expect(await paths.listForAccessPort('equipment-1:power-in')).toHaveLength(1);
  });

  it('permits one physical OUTPUT to feed exactly one INPUT', async () => {
    const secondLoad: EquipmentNode = {
      ...equipment,
      id: 'equipment-2',
      name: 'Second load',
      accessPorts: [
        {
          ...equipment.accessPorts[0]!,
          id: 'equipment-2:power-in',
          equipmentId: 'equipment-2',
        },
      ],
    };
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment, secondLoad]);
    const breaker = await createBreaker(topology, device, 'Panel A');
    const service = new PowerService(topology, new MemoryPowerRepository());
    const first = await service.create({
      sourceAccessPortId: breaker.id + ':power-out',
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'A',
    });
    expect(first.ok).toBe(true);

    const second = await service.create({
      sourceAccessPortId: breaker.id + ':power-out',
      targetAccessPortId: 'equipment-2:power-in',
      feed: 'A',
    });
    expect(second).toEqual({ ok: false, error: 'SOURCE_ALREADY_CONNECTED' });
    const repeated = await service.create({
      sourceAccessPortId: breaker.id + ':power-out',
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'A',
    });
    expect(repeated.ok).toBe(true);
    expect(repeated.ok && first.ok && repeated.value.id).toBe(
      first.ok ? first.value.id : null,
    );
  });

  it('blocks BIDIRECTIONAL ports from acting as pass-through on a second path', async () => {
    const bidirectional: EquipmentNode = {
      ...equipment,
      id: 'bidirectional',
      name: 'Board power terminal',
      accessPorts: [
        {
          ...equipment.accessPorts[0]!,
          id: 'board:power',
          equipmentId: 'bidirectional',
          direction: 'BIDIRECTIONAL',
        },
      ],
    };
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment, bidirectional]);
    const breaker = await createBreaker(topology, device, 'Panel A');
    const service = new PowerService(topology, new MemoryPowerRepository());
    const initial = await service.create({
      sourceAccessPortId: breaker.id + ':power-out',
      targetAccessPortId: 'board:power',
      feed: 'A',
    });
    expect(initial.ok).toBe(true);
    const chained = await service.create({
      sourceAccessPortId: 'board:power',
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'A',
    });
    expect(chained).toEqual({ ok: false, error: 'SOURCE_ALREADY_CONNECTED' });
  });

  it('rejects a feed that contradicts the destination POWER port contract', async () => {
    const feedLockedEquipment: EquipmentNode = {
      ...equipment,
      accessPorts: equipment.accessPorts.map((port) => ({
        ...port,
        attributes: { feed: 'A' },
      })),
    };
    const topology = new MemoryTopologyRepository([device, loadDevice, feedLockedEquipment]);
    const breaker = await createBreaker(topology, device, 'B1');

    const result = await new PowerService(topology, new MemoryPowerRepository()).create({
      sourceAccessPortId: breaker.id + ':power-out',
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'B',
    });

    expect(result).toEqual({ ok: false, error: 'FEED_MISMATCH' });
  });

  it('rejects a Feed that contradicts a POWER source even when the target has no feed', async () => {
    const sourceEquipment: EquipmentNode = {
      ...equipment,
      id: 'source-equipment',
      deviceId: device.id,
      parentId: device.id,
      parentEquipmentId: null,
      name: 'BDFB Circuit Breaker',
      accessPorts: [
        {
          id: 'source-power-out',
          deviceId: device.id,
          equipmentId: 'source-equipment',
          name: 'Power output',
          portType: 'POWER',
          direction: 'OUTPUT',
          exposure: 'EXTERNAL',
          lifecycle: 'ACTIVE',
          attributes: { feed: 'A' },
        },
      ],
    };
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment, sourceEquipment]);
    const result = await new PowerService(topology, new MemoryPowerRepository()).create({
      sourceAccessPortId: 'source-power-out',
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'B',
    });
    expect(result).toEqual({ ok: false, error: 'FEED_MISMATCH' });
  });

  it('reports concurrent Mongo target uniqueness conflicts as domain errors', async () => {
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment]);
    const breaker = await createBreaker(topology, device, 'Panel A');
    const targetPort = 'equipment-1:power-in';
    const power = new MemoryPowerRepository();
    const concurrentRepository = {
      ...power,
      getById: (id: string) => power.getById(id),
      listActive: () => power.listActive(),
      listForAccessPort: (id: string) => power.listForAccessPort(id),
      replace: (path: Parameters<typeof power.replace>[0]) => power.replace(path),
      insert: async () => {
        throw {
          code: 11000,
          keyPattern: { connectionKey: 1 },
        };
      },
    };
    const result = await new PowerService(topology, concurrentRepository).create({
      sourceAccessPortId: breaker.id + ':power-out',
      targetAccessPortId: targetPort,
      feed: 'A',
    });
    expect(result).toEqual({ ok: false, error: 'TARGET_ALREADY_CONNECTED' });
  });

  it('rejects a nonexistent AccessPort', async () => {
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment]);
    const paths = new MemoryPowerRepository();
    const result = await new PowerService(topology, paths).create({
      sourceAccessPortId: 'missing',
      targetAccessPortId: 'equipment-1:power-in',
    });

    expect(result).toEqual({ ok: false, error: 'SOURCE_PORT_NOT_FOUND' });
  });
});
