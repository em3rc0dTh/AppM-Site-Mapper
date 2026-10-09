import { describe, expect, it } from 'vitest';

import { AccessPortService } from '@/modules/topology/application/access-port-service';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';

function owner(): EquipmentNode {
  return {
    id: 'equipment-1',
    kind: 'EQUIPMENT',
    parentId: 'device-1',
    deviceId: 'device-1',
    name: 'Generic Switch',
    equipmentType: 'NETWORK_BOARD',
    parentEquipmentId: null,
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: '2026-10-09T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
  };
}

describe('AccessPortService', () => {
  it('creates, updates and archives NETWORK ports on any Equipment', async () => {
    const repository = new MemoryTopologyRepository([owner()]);
    const service = new AccessPortService(repository, new MemoryPowerRepository());

    const created = await service.upsert('equipment-1', {
      name: 'uplink-1',
      portType: 'NETWORK',
      direction: 'BIDIRECTIONAL',
      exposure: 'EXTERNAL',
      connectorType: 'SFP+',
      protocol: 'Ethernet',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.connectorType).toBe('SFP+');

    const changed = await service.upsert(
      'equipment-1',
      {
        name: 'uplink-1-renamed',
        portType: 'NETWORK',
        direction: 'BIDIRECTIONAL',
        exposure: 'EXTERNAL',
        connectorType: 'QSFP',
      },
      created.value.id,
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.id).toBe(created.value.id);

    const archived = await service.archive('equipment-1', created.value.id);
    expect(archived.ok).toBe(true);
    expect(await service.list('equipment-1')).toEqual({ ok: true, value: [] });
  });

  it('rejects incompatible changes and archiving of connected POWER ports', async () => {
    const equipment = owner();
    const port = {
      id: 'power-1',
      equipmentId: equipment.id,
      deviceId: equipment.deviceId,
      name: 'DC output',
      portType: 'POWER' as const,
      direction: 'OUTPUT' as const,
      exposure: 'EXTERNAL' as const,
      attributes: { feed: 'A' },
      lifecycle: 'ACTIVE' as const,
    };
    const repository = new MemoryTopologyRepository([{ ...equipment, accessPorts: [port] }]);
    const power = new MemoryPowerRepository([{
      id: 'path-1',
      sourceAccessPortId: 'power-1',
      targetAccessPortId: 'other-input',
      feed: 'A',
      lifecycle: 'ACTIVE',
      createdAt: '2026-10-09T00:00:00.000Z',
      updatedAt: '2026-10-09T00:00:00.000Z',
    }]);
    const service = new AccessPortService(repository, power);

    expect(await service.archive('equipment-1', 'power-1')).toEqual({
      ok: false,
      error: 'PORT_IN_USE',
    });
    expect(await service.upsert('equipment-1', {
      name: 'Ethernet output',
      portType: 'NETWORK',
      direction: 'OUTPUT',
      exposure: 'EXTERNAL',
    }, 'power-1')).toEqual({ ok: false, error: 'PORT_IN_USE' });

    const renamed = await service.upsert('equipment-1', {
      name: 'DC output renamed',
      portType: 'POWER',
      direction: 'OUTPUT',
      exposure: 'EXTERNAL',
      feed: 'A',
    }, 'power-1');
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.value.id).toBe('power-1');
  });
});
