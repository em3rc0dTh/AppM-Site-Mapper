import { describe, expect, it } from 'vitest';

import { BdfbService } from '@/modules/power/application/bdfb-service';
import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const device: DeviceNode = {
  id: 'device-1',
  kind: 'DEVICE',
  parentId: 'rack-1',
  name: 'BDFB A',
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

const equipment: EquipmentNode = {
  id: 'equipment-1',
  kind: 'EQUIPMENT',
  parentId: 'rack-1',
  name: 'Load A',
  lifecycle: 'ACTIVE',
  pinned: false,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

describe('Power domain', () => {
  it('configures BDFB independently of placement and creates an explicit breaker-to-equipment path', async () => {
    const topology = new MemoryTopologyRepository([device, equipment]);
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
                  endpoints: [
                    { id: 'breaker-a', variant: 'BREAKER', label: 'CB-A1', capacity: 20 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(configured.ok).toBe(true);

    const paths = new MemoryPowerRepository();
    const service = new PowerService(topology, paths);
    const created = await service.create({
      source: {
        entityId: device.id,
        internal: {
          shelfId: 'shelf-a',
          frameId: 'frame-a',
          panelId: 'panel-a',
          breakerHolderId: 'breaker-a',
        },
      },
      target: { entityId: equipment.id },
      feed: 'A',
      label: 'Primary feed',
    });

    expect(created.ok).toBe(true);
    expect(await paths.listForEntity(equipment.id)).toHaveLength(1);
  });

  it('rejects a nonexistent internal endpoint', async () => {
    const topology = new MemoryTopologyRepository([device, equipment]);
    const paths = new MemoryPowerRepository();
    const result = await new PowerService(topology, paths).create({
      source: {
        entityId: device.id,
        internal: { shelfId: 'missing' },
      },
      target: { entityId: equipment.id },
    });

    expect(result).toEqual({ ok: false, error: 'BDFB_NOT_CONFIGURED' });
  });
});
