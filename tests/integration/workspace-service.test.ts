import { describe, expect, it } from 'vitest';

import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { DeviceNode, EquipmentNode, NetworkNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';

const timestamp = '2026-09-22T00:00:00.000Z';

const network: NetworkNode = {
  id: 'network',
  parentId: null,
  name: 'Network',
  kind: 'NETWORK',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const device: DeviceNode = {
  id: 'device',
  parentId: 'rack',
  name: 'BDFB A',
  kind: 'DEVICE',
  pinned: true,
  serialNumber: 'BDFB-1',
  deviceType: 'BDFB',
  rootEquipmentIds: ['chassis'],
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const loadDevice: DeviceNode = {
  id: 'load-device',
  parentId: 'rack',
  name: 'Load A',
  kind: 'DEVICE',
  pinned: false,
  deviceType: 'SERVER',
  rootEquipmentIds: ['load-equipment'],
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

function equipment(
  id: string,
  parentId: string,
  deviceId: string,
  equipmentType: EquipmentNode['equipmentType'],
  children: readonly (string | null)[] = [],
): EquipmentNode {
  return {
    id,
    parentId,
    deviceId,
    name: id,
    kind: 'EQUIPMENT',
    equipmentType,
    parentEquipmentId: parentId === deviceId ? null : parentId,
    childMode: equipmentType === 'PANEL' ? 'POSITIONAL' : 'DYNAMIC',
    children,
    accessPorts: [],
    pinned: id === 'load-equipment',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const graph: EquipmentNode[] = [
  equipment('chassis', device.id, device.id, 'CHASSIS', ['shelf']),
  equipment('shelf', 'chassis', device.id, 'SHELF', ['frame']),
  equipment('frame', 'shelf', device.id, 'FRAME', ['panel']),
  equipment('panel', 'frame', device.id, 'PANEL', ['breaker']),
  {
    ...equipment('breaker', 'panel', device.id, 'CIRCUIT_BREAKER'),
    accessPorts: [
      {
        id: 'breaker:power-out',
        deviceId: device.id,
        equipmentId: 'breaker',
        name: 'Power output',
        portType: 'POWER',
        direction: 'OUTPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
      },
    ],
  },
  equipment('load-equipment', loadDevice.id, loadDevice.id, 'CHASSIS'),
];

describe('WorkspaceService', () => {
  it('projects navigation, pinned inventory and BDFB from v1.2 Equipment', async () => {
    const service = new WorkspaceService(
      new MemoryTopologyRepository([network, device, loadDevice, ...graph]),
      new MemoryPowerRepository(),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.navigation).toHaveLength(1);
    expect(snapshot.pinned.map((item) => item.kind).sort()).toEqual(['DEVICE', 'EQUIPMENT']);
    expect(snapshot.bdfb).toEqual([
      expect.objectContaining({
        deviceId: 'device',
        shelves: 1,
        frames: 1,
        panels: 1,
        endpoints: 1,
      }),
    ]);
    expect(snapshot.notifications).toEqual([
      expect.objectContaining({
        entityId: 'load-equipment',
        title: 'Telemetry identity missing',
      }),
      expect.objectContaining({
        entityId: 'load-device',
        title: 'Telemetry identity missing',
      }),
    ]);
  });
});
