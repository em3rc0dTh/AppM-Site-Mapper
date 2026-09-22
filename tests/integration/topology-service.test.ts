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
  });
  if (!site.ok) throw new Error(site.error);

  const structure = await service.create({
    kind: 'STRUCTURE',
    parentId: site.value.id,
    name: 'Structure',
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
  });
  if (!room.ok) throw new Error(room.error);

  const cluster = await service.create({
    kind: 'CONTAINER_CLUSTER_BAY',
    parentId: room.value.id,
    name: 'Bay',
    clusterVariant: 'BAY',
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

  return { network: network.value, site: site.value, rack: rack.value };
}

describe('TopologyService', () => {
  it('preserves the accepted hierarchy and Device/Equipment sibling relationship', async () => {
    const service = new TopologyService(new MemoryTopologyRepository());
    const { rack } = await buildHierarchy(service);

    const device = await service.create({
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'Device A',
    });
    const equipment = await service.create({
      kind: 'EQUIPMENT',
      parentId: rack.id,
      name: 'Equipment A',
    });

    expect(device.ok).toBe(true);
    expect(equipment.ok).toBe(true);

    const children = await service.listChildren(rack.id);
    expect(children.map((node) => node.kind).sort()).toEqual(['DEVICE', 'EQUIPMENT']);
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
