import { describe, expect, it } from 'vitest';

import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type {
  DeviceNode,
  EquipmentNode,
  NetworkNode,
} from '@/modules/topology/domain/entities';
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
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
  bdfb: {
    shelves: [
      {
        id: 'shelf',
        label: 'Shelf',
        frames: [
          {
            id: 'frame',
            label: 'Frame',
            panels: [
              {
                id: 'panel',
                label: 'Panel',
                endpoints: [{ id: 'breaker', variant: 'BREAKER', label: 'B1' }],
              },
            ],
          },
        ],
      },
    ],
  },
};

const equipment: EquipmentNode = {
  id: 'equipment',
  parentId: 'rack',
  name: 'Load A',
  kind: 'EQUIPMENT',
  pinned: true,
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('WorkspaceService', () => {
  it('projects navigation, pinned siblings, BDFB and factual warnings', async () => {
    const service = new WorkspaceService(
      new MemoryTopologyRepository([network, device, equipment]),
      new MemoryPowerRepository(),
    );

    const snapshot = await service.getSnapshot();

    expect(snapshot.navigation).toHaveLength(1);
    expect(snapshot.pinned.map((item) => item.kind).sort()).toEqual([
      'DEVICE',
      'EQUIPMENT',
    ]);
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
        entityId: 'equipment',
        title: 'Telemetry identity missing',
      }),
    ]);
  });
});
