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
