import { describe, expect, it } from 'vitest';

import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { CasService } from '@/modules/rack/application/cas-service';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

async function createRack() {
  const repository = new MemoryTopologyRepository();
  const topology = new TopologyService(repository);

  const network = await topology.create({ kind: 'NETWORK', parentId: null, name: 'Network' });
  if (!network.ok) throw new Error(network.error);
  const site = await topology.create({ kind: 'SITE', parentId: network.value.id, name: 'Site' });
  if (!site.ok) throw new Error(site.error);
  const structure = await topology.create({
    kind: 'STRUCTURE',
    parentId: site.value.id,
    name: 'Structure',
  });
  if (!structure.ok) throw new Error(structure.error);
  const level = await topology.create({
    kind: 'LEVEL',
    parentId: structure.value.id,
    name: 'Level',
  });
  if (!level.ok) throw new Error(level.error);
  const room = await topology.create({
    kind: 'ROOM_SUBSTRUCTURE',
    parentId: level.value.id,
    name: 'Room',
    roomVariant: 'ROOM',
  });
  if (!room.ok) throw new Error(room.error);
  const bay = await topology.create({
    kind: 'CONTAINER_CLUSTER_BAY',
    parentId: room.value.id,
    name: 'Bay',
    clusterVariant: 'BAY',
  });
  if (!bay.ok) throw new Error(bay.error);
  const position = await topology.create({
    kind: 'POSITION',
    parentId: bay.value.id,
    name: 'A-1',
    coordinate: { row: 'A', column: 1 },
  });
  if (!position.ok) throw new Error(position.error);
  const rack = await topology.create({
    kind: 'CONTAINER_RACK',
    parentId: position.value.id,
    name: 'Rack',
    containerVariant: 'RACK',
    totalU: 12,
  });
  if (!rack.ok) throw new Error(rack.error);

  return { repository, topology, rack: rack.value };
}

describe('inventory and rack elevation', () => {
  it('keeps Device and Equipment as siblings and resolves both in elevation', async () => {
    const { repository, topology, rack } = await createRack();
    const inventory = new InventoryService(repository);
    const cas = new CasService(repository);

    const device = await topology.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'Router',
      serialNumber: 'DEV-001',
    });
    const equipment = await topology.create({
      kind: 'EQUIPMENT',
      parentId: rack.id,
      name: 'Power Shelf',
      serialNumber: 'EQ-001',
    });

    if (!device.ok || !equipment.ok) {
      throw new Error('Expected inventory nodes.');
    }

    const listed = await inventory.listRackInventory(rack.id);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value.map((node) => node.kind).sort()).toEqual(['DEVICE', 'EQUIPMENT']);
    }

    const reserved = await cas.reserve(rack.id, { mountStartU: 4, physicalSizeU: 2 });
    if (!reserved.ok) throw new Error(reserved.error);
    const allocation = reserved.value.cas.find((range) => range.state === 'RESERVED');
    if (!allocation) throw new Error('Expected allocation.');

    const equipped = await cas.equip(rack.id, allocation.id, equipment.value.id);
    if (!equipped.ok) throw new Error(equipped.error);

    const projection = await new RackElevationService(repository).get(rack.id);
    expect(projection.ok).toBe(true);
    if (projection.ok) {
      expect(
        projection.value.units.some(
          (unit) => unit.occupant?.id === equipment.value.id && unit.occupant.kind === 'EQUIPMENT',
        ),
      ).toBe(true);
    }
  });

  it('updates inventory metadata without changing identity or placement', async () => {
    const { repository, topology, rack } = await createRack();
    const device = await topology.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'Router',
    });
    if (!device.ok) throw new Error(device.error);

    const inventory = new InventoryService(repository);
    const updated = await inventory.update(device.value.id, {
      name: 'Router Core',
      type: 'ROUTER',
      pinned: true,
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value).toMatchObject({
        id: device.value.id,
        rackId: rack.id,
        kind: 'DEVICE',
        name: 'Router Core',
        type: 'ROUTER',
        pinned: true,
      });
    }
  });
});
