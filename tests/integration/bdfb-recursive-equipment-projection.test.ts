import { describe, expect, it } from 'vitest';

import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { ContainerRackNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-10-07T00:00:00.000Z';

describe('BDFB projection from recursive Equipment', () => {
  it('projects a client-built Chassis → Shelf → Frame → Panel → Breaker hierarchy', async () => {
    const rack: ContainerRackNode = {
      id: 'rack-1',
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      parentId: 'position-1',
      name: 'Rack 1',
      totalU: 42,
      cas: [],
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const repository = new MemoryTopologyRepository([rack]);
    const topology = new TopologyService(repository);

    const device = await topology.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'BDFB-01',
      deviceType: 'BDFB',
    });
    if (!device.ok) throw new Error(device.error);

    const chassis = await topology.create({
      kind: 'EQUIPMENT',
      parentId: device.value.id,
      name: 'BDFB Chassis',
      equipmentType: 'CHASSIS',
      childMode: 'POSITIONAL',
      childCapacity: 1,
    });
    if (!chassis.ok || chassis.value.kind !== 'EQUIPMENT') throw new Error('chassis');

    const shelf = await topology.create({
      kind: 'EQUIPMENT',
      parentId: chassis.value.id,
      parentSlotIndex: 0,
      name: 'Shelf 01',
      equipmentType: 'SHELF',
      childMode: 'POSITIONAL',
      childCapacity: 2,
    });
    if (!shelf.ok || shelf.value.kind !== 'EQUIPMENT') throw new Error('shelf');

    const frame = await topology.create({
      kind: 'EQUIPMENT',
      parentId: shelf.value.id,
      parentSlotIndex: 0,
      name: 'Frame A',
      equipmentType: 'FRAME',
      childMode: 'POSITIONAL',
      childCapacity: 3,
    });
    if (!frame.ok || frame.value.kind !== 'EQUIPMENT') throw new Error('frame');

    const panel = await topology.create({
      kind: 'EQUIPMENT',
      parentId: frame.value.id,
      parentSlotIndex: 0,
      name: 'A1',
      equipmentType: 'PANEL',
      childMode: 'POSITIONAL',
      childCapacity: 24,
    });
    if (!panel.ok || panel.value.kind !== 'EQUIPMENT') throw new Error('panel');

    const breaker = await topology.create({
      kind: 'EQUIPMENT',
      parentId: panel.value.id,
      parentSlotIndex: 0,
      name: 'A1-01',
      equipmentType: 'CIRCUIT_BREAKER',
    });
    if (!breaker.ok || breaker.value.kind !== 'EQUIPMENT') throw new Error('breaker');

    const projection = await new BdfbProjectionService(repository).get(device.value.id);
    expect(projection).not.toBeNull();
    expect(projection?.chassisId).toBe(chassis.value.id);
    expect(projection?.shelves).toHaveLength(1);
    expect(projection?.shelves[0]?.label).toBe('Shelf 01');
    expect(projection?.shelves[0]?.frames).toHaveLength(1);
    expect(projection?.shelves[0]?.frames[0]?.label).toBe('Frame A');
    expect(projection?.shelves[0]?.frames[0]?.panels).toHaveLength(1);
    expect(projection?.shelves[0]?.frames[0]?.panels[0]?.label).toBe('A1');
    expect(projection?.shelves[0]?.frames[0]?.panels[0]?.positions).toHaveLength(24);
    expect(projection?.shelves[0]?.frames[0]?.panels[0]?.positions[0]).toMatchObject({
      id: breaker.value.id,
      label: 'A1-01',
      accessPortId: breaker.value.id + ':power-out',
    });
    expect(projection?.shelves[0]?.frames[0]?.panels[0]?.positions[1]).toBeNull();
  });
});
