import { describe, expect, it } from 'vitest';

import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type {
  ContainerClusterBayNode,
  LevelNode,
  NetworkNode,
  RoomSubstructureNode,
  SiteNode,
  StructureNode,
} from '@/modules/topology/domain/entities';

const timestamp = '2026-09-23T00:00:00.000Z';

const network: NetworkNode = {
  id: '00000000-0000-4000-8000-000000000100',
  kind: 'NETWORK',
  parentId: null,
  name: 'Network',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const siteBoundary = [
  { x: -1000, y: -1000 },
  { x: 4000, y: -1000 },
  { x: 4000, y: 4000 },
  { x: -1000, y: 4000 },
] as const;

const site: SiteNode = {
  id: '00000000-0000-4000-8000-000000000101',
  kind: 'SITE',
  parentId: network.id,
  name: 'Site',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
  polygon: siteBoundary,
};

const structure: StructureNode = {
  id: '00000000-0000-4000-8000-000000000102',
  kind: 'STRUCTURE',
  parentId: site.id,
  name: 'Structure',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const level: LevelNode = {
  id: '00000000-0000-4000-8000-000000000103',
  kind: 'LEVEL',
  parentId: structure.id,
  name: 'Level',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const room: RoomSubstructureNode = {
  id: '00000000-0000-4000-8000-000000000104',
  kind: 'ROOM_SUBSTRUCTURE',
  parentId: level.id,
  name: 'Room',
  variant: 'ROOM',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};


const emptyCluster: ContainerClusterBayNode = {
  id: '00000000-0000-4000-8000-000000000105',
  kind: 'CONTAINER_CLUSTER_BAY',
  parentId: room.id,
  name: 'Bay 1',
  variant: 'BAY',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const polygon = [
  { x: 0, y: 0 },
  { x: 1800, y: 0 },
  { x: 1800, y: 600 },
  { x: 1200, y: 600 },
  { x: 1200, y: 1200 },
  { x: 0, y: 1200 },
] as const;

describe('SpatialService boundary authoring', () => {
  it('persists polygon boundaries for Site, Structure and Room', async () => {
    const repository = new MemoryTopologyRepository([network, site, structure, level, room]);
    const service = new SpatialService(repository);

    const siteResult = await service.updateBoundary(site.id, polygon);
    const structureResult = await service.updateBoundary(structure.id, polygon);
    const roomResult = await service.updateBoundary(room.id, polygon);

    expect(siteResult.ok).toBe(true);
    expect(structureResult.ok).toBe(true);
    expect(roomResult.ok).toBe(true);

    const persistedSite = await repository.getById(site.id);
    const persistedStructure = await repository.getById(structure.id);
    const persistedRoom = await repository.getById(room.id);

    expect(persistedSite?.kind === 'SITE' ? persistedSite.polygon : undefined).toEqual(polygon);
    expect(
      persistedStructure?.kind === 'STRUCTURE' ? persistedStructure.polygon : undefined,
    ).toEqual(polygon);
    expect(persistedRoom?.kind === 'ROOM_SUBSTRUCTURE' ? persistedRoom.polygon : undefined).toEqual(
      polygon,
    );
  });

  it('rejects a Structure footprint outside its parent Site boundary', async () => {
    const repository = new MemoryTopologyRepository([network, site, structure, level, room]);
    const result = await new SpatialService(repository).updateBoundary(structure.id, [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 1200 },
      { x: 0, y: 1200 },
    ]);

    expect(result).toEqual({ ok: false, error: 'BOUNDARY_OUTSIDE_PARENT' });
  });

  it('persists a Structure footprint contained by its Site', async () => {
    const repository = new MemoryTopologyRepository([network, site, structure, level, room]);
    const result = await new SpatialService(repository).updateBoundary(structure.id, [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 1200, y: 1200 },
      { x: 0, y: 1200 },
    ]);

    expect(result.ok).toBe(true);
    const persisted = await repository.getById(structure.id);
    expect(persisted?.kind === 'STRUCTURE' ? persisted.polygon?.length : 0).toBe(4);
  });


  it('keeps an empty ContainerCluster/Bay visible as unplaced instead of dropping it', async () => {
    const repository = new MemoryTopologyRepository([
      network,
      site,
      structure,
      level,
      { ...room, polygon },
      emptyCluster,
    ]);
    const result = await new SpatialService(repository).getRoomLayout(room.id);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.clusters).toEqual([
      {
        id: emptyCluster.id,
        name: emptyCluster.name,
        variant: emptyCluster.variant,
        positionCount: 0,
      },
    ]);
  });

  it('does not invent persisted geometry for Level', async () => {
    const repository = new MemoryTopologyRepository([network, site, structure, level, room]);
    const result = await new SpatialService(repository).updateBoundary(level.id, polygon);

    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_BOUNDARY_KIND' });
  });

  it('rejects a self-intersecting boundary before persistence', async () => {
    const repository = new MemoryTopologyRepository([network, site, structure, level, room]);
    const result = await new SpatialService(repository).updateBoundary(site.id, [
      { x: 0, y: 0 },
      { x: 1200, y: 1200 },
      { x: 0, y: 1200 },
      { x: 1200, y: 0 },
    ]);

    expect(result).toEqual({ ok: false, error: 'INVALID_POLYGON' });
  });
});
