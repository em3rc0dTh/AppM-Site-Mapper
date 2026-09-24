import { describe, expect, it } from 'vitest';

import { ClusterRunAuthoringService } from '@/modules/spatial/application/cluster-run-authoring-service';
import type {
  ContainerClusterBayNode,
  LevelNode,
  NetworkNode,
  RoomSubstructureNode,
  SiteNode,
  StructureNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-24T00:00:00.000Z';

const network: NetworkNode = {
  id: '00000000-0000-4000-8000-000000000301',
  kind: 'NETWORK',
  parentId: null,
  name: 'Network',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const site: SiteNode = {
  id: '00000000-0000-4000-8000-000000000302',
  kind: 'SITE',
  parentId: network.id,
  name: 'Site',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const structure: StructureNode = {
  id: '00000000-0000-4000-8000-000000000303',
  kind: 'STRUCTURE',
  parentId: site.id,
  name: 'Structure',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const level: LevelNode = {
  id: '00000000-0000-4000-8000-000000000304',
  kind: 'LEVEL',
  parentId: structure.id,
  name: 'Level 1',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

const room: RoomSubstructureNode = {
  id: '00000000-0000-4000-8000-000000000305',
  kind: 'ROOM_SUBSTRUCTURE',
  parentId: level.id,
  name: 'Room',
  variant: 'ROOM',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
  polygon: [
    { x: 0, y: 0 },
    { x: 4800, y: 0 },
    { x: 4800, y: 3000 },
    { x: 0, y: 3000 },
  ],
};

const cluster: ContainerClusterBayNode = {
  id: '00000000-0000-4000-8000-000000000306',
  kind: 'CONTAINER_CLUSTER_BAY',
  parentId: room.id,
  name: 'Bay-01',
  variant: 'BAY',
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('ClusterRunAuthoringService', () => {
  it('creates every 600 mm Position between horizontal start and end slots', async () => {
    const repository = new MemoryTopologyRepository([
      network,
      site,
      structure,
      level,
      room,
      cluster,
    ]);
    const result = await new ClusterRunAuthoringService(repository).configure(cluster.id, {
      start: { row: 'B', column: 2 },
      end: { row: 'B', column: 5 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.cluster.run).toEqual({
      start: { row: 'B', column: 2 },
      end: { row: 'B', column: 5 },
      orientation: 'HORIZONTAL',
    });
    expect(result.value.positions.map((position) => position.coordinate)).toEqual([
      { row: 'B', column: 2 },
      { row: 'B', column: 3 },
      { row: 'B', column: 4 },
      { row: 'B', column: 5 },
    ]);
  });

  it('creates a vertical run and persists the authored endpoints', async () => {
    const repository = new MemoryTopologyRepository([
      network,
      site,
      structure,
      level,
      room,
      cluster,
    ]);
    const result = await new ClusterRunAuthoringService(repository).configure(cluster.id, {
      start: { row: 'A', column: 3 },
      end: { row: 'D', column: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.cluster.run?.orientation).toBe('VERTICAL');
    expect(result.value.positions).toHaveLength(4);
  });

  it('rejects diagonal runs and slots outside the Room', async () => {
    const repository = new MemoryTopologyRepository([
      network,
      site,
      structure,
      level,
      room,
      cluster,
    ]);
    const service = new ClusterRunAuthoringService(repository);

    await expect(
      service.configure(cluster.id, {
        start: { row: 'A', column: 1 },
        end: { row: 'C', column: 3 },
      }),
    ).resolves.toEqual({ ok: false, error: 'INVALID_CLUSTER_RUN' });

    await expect(
      service.configure(cluster.id, {
        start: { row: 'A', column: 8 },
        end: { row: 'A', column: 9 },
      }),
    ).resolves.toEqual({ ok: false, error: 'CLUSTER_SLOT_OUTSIDE_ROOM' });
  });

  it('prevents two sibling clusters from claiming the same slot', async () => {
    const sibling: ContainerClusterBayNode = {
      ...cluster,
      id: '00000000-0000-4000-8000-000000000307',
      name: 'Bay-02',
    };
    const repository = new MemoryTopologyRepository([
      network,
      site,
      structure,
      level,
      room,
      cluster,
      sibling,
    ]);
    const service = new ClusterRunAuthoringService(repository);

    const first = await service.configure(cluster.id, {
      start: { row: 'C', column: 2 },
      end: { row: 'C', column: 4 },
    });
    expect(first.ok).toBe(true);

    await expect(
      service.configure(sibling.id, {
        start: { row: 'C', column: 4 },
        end: { row: 'C', column: 6 },
      }),
    ).resolves.toEqual({ ok: false, error: 'CLUSTER_SLOT_OCCUPIED' });
  });
});
