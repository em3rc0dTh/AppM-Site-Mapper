import { describe, expect, it } from 'vitest';

import { BdfbService } from '@/modules/power/application/bdfb-service';
import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
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

describe('Power domain', () => {
  it('materializes BDFB Equipment and creates an AccessPort-to-AccessPort path', async () => {
    const topology = new MemoryTopologyRepository([device, loadDevice, equipment]);
    const configured = await new BdfbService(topology).configure(device.id, {
      shelves: [
        {
          id: 'shelf-a',
          label: 'Shelf A',
          frames: [
            {
              id: 'frame-a',
              label: 'Frame A',
              panels: [
                {
                  id: 'panel-a',
                  label: 'Panel A',
                  positions: [{ id: 'breaker-a', label: 'CB-A1', capacity: 20 }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(configured.ok).toBe(true);

    const sourceAccessPortId = 'device-1:equipment:breaker-a:power-out';
    const paths = new MemoryPowerRepository();
    const service = new PowerService(topology, paths);
    const created = await service.create({
      sourceAccessPortId,
      targetAccessPortId: 'equipment-1:power-in',
      feed: 'A',
      label: 'Primary feed',
    });

    expect(created.ok).toBe(true);
    expect(await paths.listForAccessPort('equipment-1:power-in')).toHaveLength(1);
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
