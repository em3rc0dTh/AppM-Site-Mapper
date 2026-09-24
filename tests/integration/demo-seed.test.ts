import { describe, expect, it } from 'vitest';

import { seedDevelopmentDemo } from '@/dev/demo-seed';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

describe('development demo seed', () => {
  it('creates a representative idempotent MK1 demo topology', async () => {
    const topology = new MemoryTopologyRepository();
    const power = new MemoryPowerRepository();

    const first = await seedDevelopmentDemo(topology, power);

    expect(first.alreadyPresent).toBe(false);
    expect(await topology.listByKind('NETWORK')).toHaveLength(1);
    expect(await topology.listByKind('SITE')).toHaveLength(1);
    expect(await topology.listByKind('STRUCTURE')).toHaveLength(1);
    expect(await topology.listByKind('LEVEL')).toHaveLength(1);
    expect(await topology.listByKind('ROOM_SUBSTRUCTURE')).toHaveLength(1);
    expect(await topology.listByKind('CONTAINER_CLUSTER_BAY')).toHaveLength(2);
    expect(await topology.listByKind('POSITION')).toHaveLength(3);
    expect(await topology.listByKind('CONTAINER_RACK')).toHaveLength(3);
    expect(await topology.listByKind('DEVICE')).toHaveLength(2);
    expect(await topology.listByKind('EQUIPMENT')).toHaveLength(2);
    expect(await power.listActive()).toHaveLength(2);

    const rooms = await topology.listByKind('ROOM_SUBSTRUCTURE');
    const room = rooms[0];
    expect(room?.kind).toBe('ROOM_SUBSTRUCTURE');

    if (!room || room.kind !== 'ROOM_SUBSTRUCTURE') {
      throw new Error('Expected demo room.');
    }

    expect(room.polygon).toHaveLength(6);

    const layout = await new SpatialService(topology).getRoomLayout(room.id);
    expect(layout.ok).toBe(true);

    if (!layout.ok) {
      throw new Error('Expected demo room layout.');
    }

    expect(layout.value.clusters).toHaveLength(2);
    expect(layout.value.positions).toHaveLength(3);
    expect(layout.value.racks).toHaveLength(3);
    expect(layout.value.positions.every((position) => position.occupied)).toBe(true);

    const devices = await topology.listByKind('DEVICE');
    const bdfb = devices.find((node) => node.kind === 'DEVICE' && node.name === 'BDFB-A');

    expect(bdfb?.kind).toBe('DEVICE');

    if (!bdfb || bdfb.kind !== 'DEVICE') {
      throw new Error('Expected demo BDFB.');
    }

    expect(bdfb.deviceType).toBe('BDFB');
    expect(bdfb.bdfb?.shelves).toHaveLength(1);
    expect(bdfb.pinned).toBe(true);

    const racks = await topology.listByKind('CONTAINER_RACK');
    const rackA02 = racks.find(
      (node) => node.kind === 'CONTAINER_RACK' && node.name === 'RACK-A02',
    );

    expect(rackA02?.kind).toBe('CONTAINER_RACK');

    if (!rackA02 || rackA02.kind !== 'CONTAINER_RACK') {
      throw new Error('Expected RACK-A02.');
    }

    expect(rackA02.cas.some((range) => range.state === 'EQUIPPED')).toBe(true);
    expect(rackA02.cas.some((range) => range.state === 'RESERVED')).toBe(true);

    const second = await seedDevelopmentDemo(topology, power);

    expect(second.alreadyPresent).toBe(true);
    expect(await topology.listByKind('NETWORK')).toHaveLength(1);
    expect(await topology.listByKind('CONTAINER_RACK')).toHaveLength(3);
    expect(await topology.listByKind('DEVICE')).toHaveLength(2);
    expect(await topology.listByKind('EQUIPMENT')).toHaveLength(2);
    expect(await power.listActive()).toHaveLength(2);
    expect(second.networkId).toBe(first.networkId);
    expect(second.roomId).toBe(first.roomId);
  });
});
