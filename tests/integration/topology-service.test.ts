import { describe, expect, it } from 'vitest';

import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

async function buildHierarchy(service: TopologyService) {
  const network = await service.create({ kind: 'NETWORK', parentId: null, name: 'Network' });
  if (!network.ok) throw new Error(network.error);

  const site = await service.create({
    kind: 'SITE',
    parentId: network.value.id,
    name: 'Site',
    polygon: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 6000 },
      { x: 0, y: 6000 },
    ],
  });
  if (!site.ok) throw new Error(site.error);

  const structure = await service.create({
    kind: 'STRUCTURE',
    parentId: site.value.id,
    name: 'Structure',
    polygon: [
      { x: 0, y: 0 },
      { x: 4800, y: 0 },
      { x: 4800, y: 4800 },
      { x: 0, y: 4800 },
    ],
  });
  if (!structure.ok) throw new Error(structure.error);

  const level = await service.create({
    kind: 'LEVEL',
    parentId: structure.value.id,
    name: 'Level',
  });
  if (!level.ok) throw new Error(level.error);

  const room = await service.create({
    kind: 'ROOM_SUBSTRUCTURE',
    parentId: level.value.id,
    name: 'Room',
    roomVariant: 'ROOM',
    polygon: [
      { x: 0, y: 0 },
      { x: 3600, y: 0 },
      { x: 3600, y: 3600 },
      { x: 0, y: 3600 },
    ],
  });
  if (!room.ok) throw new Error(room.error);

  const cluster = await service.create({
    kind: 'CONTAINER_CLUSTER_BAY',
    parentId: room.value.id,
    name: 'Bay',
    clusterVariant: 'BAY',
    polygon: [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 1200, y: 600 },
      { x: 0, y: 600 },
    ],
  });
  if (!cluster.ok) throw new Error(cluster.error);

  const position = await service.create({
    kind: 'POSITION',
    parentId: cluster.value.id,
    name: 'A-1',
    coordinate: { row: 'A', column: 1 },
  });
  if (!position.ok) throw new Error(position.error);

  const rack = await service.create({
    kind: 'CONTAINER_RACK',
    parentId: position.value.id,
    name: 'Rack 1',
    containerVariant: 'RACK',
    totalU: 42,
  });
  if (!rack.ok) throw new Error(rack.error);

  return {
    network: network.value,
    site: site.value,
    structure: structure.value,
    level: level.value,
    room: room.value,
    cluster: cluster.value,
    position: position.value,
    rack: rack.value,
  };
}

describe('TopologyService', () => {
  it('preserves Rack → Device → recursive Equipment hierarchy', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { rack } = await buildHierarchy(service);

    const device = await service.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'Device A',
    });
    if (!device.ok) throw new Error(device.error);
    const equipment = await service.create({
      kind: 'EQUIPMENT',
      parentId: device.value.id,
      name: 'Equipment A',
    });
    if (!equipment.ok) throw new Error(equipment.error);
    const nested = await service.create({
      kind: 'EQUIPMENT',
      parentId: equipment.value.id,
      name: 'Equipment A.1',
    });

    expect(nested.ok).toBe(true);
    expect((await service.listChildren(rack.id)).map((node) => node.kind)).toEqual(['DEVICE']);
    expect((await service.listChildren(device.value.id)).map((node) => node.kind)).toEqual([
      'EQUIPMENT',
    ]);
    expect((await service.listChildren(equipment.value.id)).map((node) => node.kind)).toEqual([
      'EQUIPMENT',
    ]);

    await expect(
      service.create({ kind: 'EQUIPMENT', parentId: rack.id, name: 'Invalid Rack Equipment' }),
    ).resolves.toEqual({ ok: false, error: 'INVALID_PARENT' });
  });


  it('creates, repositions and detaches Equipment through positional slots', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { rack } = await buildHierarchy(service);

    const device = await service.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'BDFB-01',
      deviceType: 'BDFB',
    });
    if (!device.ok) throw new Error(device.error);

    const chassis = await service.create({
      kind: 'EQUIPMENT',
      parentId: device.value.id,
      name: 'BDFB Chassis',
      equipmentType: 'CHASSIS',
      childMode: 'POSITIONAL',
      childCapacity: 2,
    });
    if (!chassis.ok || chassis.value.kind !== 'EQUIPMENT') {
      throw new Error(chassis.ok ? 'Expected Equipment' : chassis.error);
    }

    await expect(
      service.create({
        kind: 'EQUIPMENT',
        parentId: chassis.value.id,
        name: 'Shelf missing slot',
        equipmentType: 'SHELF',
      }),
    ).resolves.toEqual({ ok: false, error: 'POSITION_SLOT_REQUIRED' });

    const shelf = await service.create({
      kind: 'EQUIPMENT',
      parentId: chassis.value.id,
      parentSlotIndex: 0,
      name: 'Shelf 01',
      equipmentType: 'SHELF',
      childMode: 'POSITIONAL',
      childCapacity: 2,
    });
    expect(shelf.ok).toBe(true);
    if (!shelf.ok || shelf.value.kind !== 'EQUIPMENT') return;

    let storedChassis = await service.getById(chassis.value.id);
    expect(storedChassis?.kind === 'EQUIPMENT' ? storedChassis.children : []).toEqual([
      shelf.value.id,
      null,
    ]);
    expect(shelf.value.parentEquipmentId).toBe(chassis.value.id);

    await expect(
      service.create({
        kind: 'EQUIPMENT',
        parentId: chassis.value.id,
        parentSlotIndex: 0,
        name: 'Shelf collision',
        equipmentType: 'SHELF',
      }),
    ).resolves.toEqual({ ok: false, error: 'SLOT_OCCUPIED' });

    const repositioned = await service.move(shelf.value.id, chassis.value.id, 1);
    expect(repositioned.ok).toBe(true);
    storedChassis = await service.getById(chassis.value.id);
    expect(storedChassis?.kind === 'EQUIPMENT' ? storedChassis.children : []).toEqual([
      null,
      shelf.value.id,
    ]);

    const detached = await service.move(shelf.value.id, device.value.id);
    expect(detached.ok).toBe(true);
    if (detached.ok && detached.value.kind === 'EQUIPMENT') {
      expect(detached.value.parentEquipmentId).toBeNull();
      expect(detached.value.parentId).toBe(device.value.id);
    }

    storedChassis = await service.getById(chassis.value.id);
    expect(storedChassis?.kind === 'EQUIPMENT' ? storedChassis.children : []).toEqual([
      null,
      null,
    ]);
    const storedDevice = await service.getById(device.value.id);
    expect(storedDevice?.kind === 'DEVICE' ? storedDevice.rootEquipmentIds : []).toEqual(
      expect.arrayContaining([chassis.value.id, shelf.value.id]),
    );
  });


  it('requires explicit detach before Equipment archive and restores without hidden slot metadata', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { rack } = await buildHierarchy(service);
    const device = await service.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'Device recursive',
    });
    if (!device.ok) throw new Error(device.error);

    const panel = await service.create({
      kind: 'EQUIPMENT',
      parentId: device.value.id,
      name: 'Panel A1',
      equipmentType: 'PANEL',
      childMode: 'POSITIONAL',
      childCapacity: 2,
    });
    if (!panel.ok || panel.value.kind !== 'EQUIPMENT') throw new Error('Expected panel');

    const breaker = await service.create({
      kind: 'EQUIPMENT',
      parentId: panel.value.id,
      parentSlotIndex: 0,
      name: 'Breaker 01',
      equipmentType: 'CIRCUIT_BREAKER',
    });
    if (!breaker.ok || breaker.value.kind !== 'EQUIPMENT') throw new Error('Expected breaker');
    expect(breaker.value.accessPorts).toMatchObject([
      { portType: 'POWER', direction: 'OUTPUT', equipmentId: breaker.value.id },
    ]);

    const expanded = await service.configureEquipment(panel.value.id, {
      equipmentType: 'PANEL',
      childMode: 'POSITIONAL',
      childCapacity: 3,
    });
    expect(expanded.ok).toBe(true);
    expect(expanded.ok ? expanded.value.children : []).toEqual([breaker.value.id, null, null]);

    await expect(service.archive(breaker.value.id)).resolves.toEqual({
      ok: false,
      error: 'DETACH_REQUIRED',
    });

    const detached = await service.move(breaker.value.id, device.value.id);
    expect(detached.ok).toBe(true);

    const afterDetach = await service.getById(panel.value.id);
    expect(afterDetach?.kind === 'EQUIPMENT' ? afterDetach.children : []).toEqual([
      null,
      null,
      null,
    ]);

    const archived = await service.archive(breaker.value.id);
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.value.lifecycle).toBe('ARCHIVED');

    const restored = await service.restore(breaker.value.id);
    expect(restored.ok).toBe(true);
    if (restored.ok && restored.value.kind === 'EQUIPMENT') {
      expect(restored.value.lifecycle).toBe('ACTIVE');
      expect(restored.value.parentEquipmentId).toBeNull();
      expect(restored.value.parentId).toBe(device.value.id);
    }

    const afterRestore = await service.getById(panel.value.id);
    expect(afterRestore?.kind === 'EQUIPMENT' ? afterRestore.children : []).toEqual([
      null,
      null,
      null,
    ]);

    await expect(
      service.configureEquipment(panel.value.id, {
        childMode: 'POSITIONAL',
        childCapacity: 0,
      }),
    ).resolves.toEqual({ ok: false, error: 'INVALID_CHILD_CAPACITY' });
  });

  it('rejects hierarchy skips and occupied positions', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { network, rack } = await buildHierarchy(service);

    await expect(
      service.create({ kind: 'DEVICE', parentId: network.id, name: 'Invalid' }),
    ).resolves.toEqual({ ok: false, error: 'INVALID_PARENT' });

    const rackNode = await service.getById(rack.id);
    expect(rackNode?.parentId).toBeTruthy();

    const duplicate = await service.create({
      kind: 'CONTAINER_RACK',
      parentId: rackNode?.parentId ?? '',
      name: 'Rack 2',
      containerVariant: 'RACK',
      totalU: 42,
    });

    expect(duplicate).toEqual({ ok: false, error: 'POSITION_OCCUPIED' });
  });

  it('refuses to archive parents with active children', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { network } = await buildHierarchy(service);

    await expect(service.archive(network.id)).resolves.toEqual({
      ok: false,
      error: 'HAS_ACTIVE_CHILDREN',
    });
  });

  it('builds a canonical navigation tree without UI-specific aliases', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { network, rack } = await buildHierarchy(service);

    const tree = await service.buildNavigationTree(network.id);

    expect(tree?.node.id).toBe(network.id);
    expect(tree?.children[0]?.node.kind).toBe('SITE');

    let current = tree;
    while (current && current.node.id !== rack.id) {
      current = current.children[0] ?? null;
    }

    expect(current?.node.id).toBe(rack.id);
    expect(current?.href).toContain('/topology/');
  });

  it('keeps deep links canonical when the navigation tree is rooted below Network', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { room, cluster, position, rack } = await buildHierarchy(service);

    const tree = await service.buildNavigationTree(room.id);

    expect(tree?.node.id).toBe(room.id);
    expect(tree?.href).toBe(await service.buildDeepLink(room.id));

    const descendants = [
      tree?.children[0],
      tree?.children[0]?.children[0],
      tree?.children[0]?.children[0]?.children[0],
    ].filter(Boolean);

    expect(descendants.map((item) => item?.node.id)).toEqual([cluster.id, position.id, rack.id]);

    for (const item of descendants) {
      if (!item) continue;

      expect(item.href).toBe(await service.buildDeepLink(item.node.id));

      const segments = item.href.replace('/topology/', '').split('/');
      const resolved = await service.resolveDeepLink(segments);

      expect(resolved.ok).toBe(true);
      if (resolved.ok) {
        expect(resolved.value.id).toBe(item.node.id);
      }
    }
  });

  it('builds and resolves deterministic deep links', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { rack } = await buildHierarchy(service);

    const link = await service.buildDeepLink(rack.id);
    const segments = link.replace('/topology/', '').split('/');
    const resolved = await service.resolveDeepLink(segments);

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value.id).toBe(rack.id);
    }
  });
});
