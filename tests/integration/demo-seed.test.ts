import { describe, expect, it } from 'vitest';

import { seedDevelopmentDemo } from '@/dev/demo-seed';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

describe('development demo seed', () => {
  it('creates the approved visual-parity demo topology idempotently', async () => {
    const topology = new MemoryTopologyRepository();
    const power = new MemoryPowerRepository();

    const first = await seedDevelopmentDemo(topology, power);

    expect(first.alreadyPresent).toBe(false);
    expect(await topology.listByKind('NETWORK')).toHaveLength(1);
    expect(await topology.listByKind('SITE')).toHaveLength(3);
    expect(await topology.listByKind('STRUCTURE')).toHaveLength(3);
    expect(await topology.listByKind('LEVEL')).toHaveLength(4);
    expect(await topology.listByKind('ROOM_SUBSTRUCTURE')).toHaveLength(4);
    expect(await topology.listByKind('CONTAINER_CLUSTER_BAY')).toHaveLength(1);
    expect(await topology.listByKind('POSITION')).toHaveLength(5);
    expect(await topology.listByKind('CONTAINER_RACK')).toHaveLength(5);
    expect(await topology.listByKind('DEVICE')).toHaveLength(8);
    expect(await power.listActive()).toHaveLength(2);

    const rooms = await topology.listByKind('ROOM_SUBSTRUCTURE');
    const room202 = rooms.find((node) => node.kind === 'ROOM_SUBSTRUCTURE' && node.name === 'Room 202');
    expect(room202?.kind).toBe('ROOM_SUBSTRUCTURE');
    if (!room202 || room202.kind !== 'ROOM_SUBSTRUCTURE') throw new Error('Expected Room 202.');
    expect(room202.polygon).toHaveLength(4);

    const racks = await topology.listByKind('CONTAINER_RACK');
    const rack023 = racks.find((node) => node.kind === 'CONTAINER_RACK' && node.name === 'R-023');
    expect(rack023?.kind).toBe('CONTAINER_RACK');
    if (!rack023 || rack023.kind !== 'CONTAINER_RACK') throw new Error('Expected R-023.');
    expect(rack023.cas.filter((range) => range.state === 'EQUIPPED')).toHaveLength(6);
    expect(rack023.cas.some((range) => range.state === 'RESERVED')).toBe(true);

    const devices = await topology.listByKind('DEVICE');
    const bdfbA = devices.find((node) => node.kind === 'DEVICE' && node.name === 'BDFB-A');
    const bdfbB = devices.find((node) => node.kind === 'DEVICE' && node.name === 'BDFB-B');
    expect(bdfbA?.kind).toBe('DEVICE');
    expect(bdfbB?.kind).toBe('DEVICE');
    if (!bdfbA || bdfbA.kind !== 'DEVICE') throw new Error('Expected BDFB-A.');
    expect(bdfbA.deviceType).toBe('BDFB');
    expect(bdfbA.bdfb?.shelves).toHaveLength(1);
    expect(bdfbA.pinned).toBe(true);

    const second = await seedDevelopmentDemo(topology, power);
    expect(second.alreadyPresent).toBe(true);
    expect(await topology.listByKind('SITE')).toHaveLength(3);
    expect(await topology.listByKind('CONTAINER_RACK')).toHaveLength(5);
    expect(await topology.listByKind('DEVICE')).toHaveLength(8);
    expect(await power.listActive()).toHaveLength(2);
    expect(second.networkId).toBe(first.networkId);
    expect(second.roomId).toBe(first.roomId);
  });
});
