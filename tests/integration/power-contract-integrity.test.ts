import { describe, expect, it } from 'vitest';

import { PowerContractService } from '@/modules/inventory/application/power-contract-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const stamp = '2026-10-12T09:00:00.000Z';

function fixture() {
  const device: DeviceNode = {
    id: 'switch-device',
    kind: 'DEVICE',
    parentId: 'rack-1',
    deviceType: 'NETWORK_ELEMENT',
    name: 'Switch',
    rootEquipmentIds: ['chassis-1'],
    lifecycle: 'ACTIVE',
    pinned: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const chassis: EquipmentNode = {
    id: 'chassis-1',
    kind: 'EQUIPMENT',
    parentId: device.id,
    deviceId: device.id,
    name: 'Switch Chassis',
    equipmentType: 'CHASSIS',
    parentEquipmentId: null,
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [
      {
        id: 'in-a',
        deviceId: device.id,
        equipmentId: 'chassis-1',
        name: 'Power input',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        attributes: { feed: 'A' },
        lifecycle: 'ACTIVE',
      },
    ],
    lifecycle: 'ACTIVE',
    pinned: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
  return { device, chassis };
}

describe('PowerContractService linked-port integrity', () => {
  it('refuses removing or changing the Feed on an INPUT referenced by an active PowerPath', async () => {
    const { device, chassis } = fixture();
    const topology = new MemoryTopologyRepository([device, chassis]);
    const paths = new MemoryPowerRepository([
      {
        id: 'path-1',
        sourceAccessPortId: 'breaker-out',
        targetAccessPortId: 'in-a',
        feed: 'A',
        lifecycle: 'ACTIVE',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ]);
    const service = new PowerContractService(topology, paths);
    expect(await service.update(device.id, { accessPorts: [], redundancy: 'NONE' })).toEqual({
      ok: false,
      error: 'PORT_IN_USE',
    });
    expect(
      await service.update(device.id, {
        accessPorts: [{ id: 'in-a', label: 'Power input', feed: 'B' }],
        redundancy: 'NONE',
      }),
    ).toEqual({ ok: false, error: 'PORT_IN_USE' });
    expect(
      await service.update(device.id, {
        accessPorts: [{ id: 'in-a', label: 'Renamed power input', feed: 'A' }],
        redundancy: 'NONE',
      }),
    ).toMatchObject({ ok: true });
    const saved = await topology.getById(chassis.id);
    expect(saved?.kind === 'EQUIPMENT' ? saved.accessPorts[0]?.name : null).toBe('Renamed power input');
    expect(await paths.listForAccessPort('in-a')).toHaveLength(1);
  });

  it('does not silently create fictional Equipment for Devices without documented physical roots', async () => {
    const { device } = fixture();
    const empty = { ...device, rootEquipmentIds: [] };
    const topology = new MemoryTopologyRepository([empty]);
    const service = new PowerContractService(topology, new MemoryPowerRepository());
    expect(
      await service.update(device.id, {
        accessPorts: [{ id: 'in-a', label: 'Power input', feed: 'A' }],
        redundancy: 'NONE',
      }),
    ).toEqual({ ok: false, error: 'EQUIPMENT_REQUIRED' });
    expect(await topology.listEquipmentForDevice(device.id)).toHaveLength(0);
  });

  it('rejects unguarded persistence without a Power repository or atomic storage', async () => {
    const { device, chassis } = fixture();
    const topology = new MemoryTopologyRepository([device, chassis]);
    const service = new PowerContractService(topology);
    expect(
      await service.update(device.id, {
        accessPorts: [{ id: 'in-a', label: 'Power input', feed: 'A' }],
        redundancy: 'NONE',
      }),
    ).toEqual({ ok: false, error: 'POWER_REPOSITORY_REQUIRED' });
  });
});
