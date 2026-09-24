import { describe, expect, it } from 'vitest';

import { RackPlacementService } from '@/modules/spatial/application/rack-placement-service';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import type {
  ContainerClusterBayNode,
  ContainerRackNode,
  LevelNode,
  NetworkNode,
  PositionNode,
  RoomSubstructureNode,
  SiteNode,
  StructureNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-24T00:00:00.000Z';

function hierarchy() {
  const network: NetworkNode = {
    id: '00000000-0000-4000-8000-000000000201',
    kind: 'NETWORK',
    parentId: null,
    name: 'Network',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const site: SiteNode = {
    id: '00000000-0000-4000-8000-000000000202',
    kind: 'SITE',
    parentId: network.id,
    name: 'Site',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const structure: StructureNode = {
    id: '00000000-0000-4000-8000-000000000203',
    kind: 'STRUCTURE',
    parentId: site.id,
    name: 'Structure',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const level: LevelNode = {
    id: '00000000-0000-4000-8000-000000000204',
    kind: 'LEVEL',
    parentId: structure.id,
    name: 'Level',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const room: RoomSubstructureNode = {
    id: '00000000-0000-4000-8000-000000000205',
    kind: 'ROOM_SUBSTRUCTURE',
    parentId: level.id,
    name: 'Room',
    variant: 'ROOM',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    polygon: [
      { x: 0, y: 0 },
      { x: 2400, y: 0 },
      { x: 2400, y: 1800 },
      { x: 0, y: 1800 },
    ],
  };
  const cluster: ContainerClusterBayNode = {
    id: '00000000-0000-4000-8000-000000000206',
    kind: 'CONTAINER_CLUSTER_BAY',
    parentId: room.id,
    name: 'Bay-01',
    variant: 'BAY',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    run: {
      start: { row: 'A', column: 1 },
      end: { row: 'A', column: 4 },
      orientation: 'HORIZONTAL',
    },
  };
  const positions: PositionNode[] = [1, 2, 3, 4].map((column) => ({
    id: `00000000-0000-4000-8000-00000000021${column}`,
    kind: 'POSITION',
    parentId: cluster.id,
    name: `A-${column}`,
    coordinate: { row: 'A', column },
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const rack: ContainerRackNode = {
    id: '00000000-0000-4000-8000-000000000220',
    kind: 'CONTAINER_RACK',
    parentId: positions[0]!.id,
    name: 'Rack wide',
    variant: 'RACK',
    totalU: 42,
    dimensionsMm: { width: 900, depth: 1200 },
    cas: [],
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return { network, site, structure, level, room, cluster, positions, rack };
}

describe('RackPlacementService', () => {
  it('marks every slot overlapped by rack width as occupied and exposes its footprint', async () => {
    const data = hierarchy();
    const repository = new MemoryTopologyRepository([
      data.network,
      data.site,
      data.structure,
      data.level,
      data.room,
      data.cluster,
      ...data.positions,
      data.rack,
    ]);

    const layout = await new SpatialService(repository).getRoomLayout(data.room.id);

    expect(layout.ok).toBe(true);
    if (!layout.ok) return;

    expect(layout.value.racks[0]?.rect).toEqual({ x: 0, y: 0, width: 900, depth: 1200 });
    expect(
      layout.value.positions
        .filter((position) => position.occupied)
        .map((position) => [position.coordinate, position.occupancyRole]),
    ).toEqual([
      ['A-1', 'ANCHOR'],
      ['A-2', 'COVERED'],
    ]);
  });

  it('rejects a new asset when its footprint overlaps a wider rack', async () => {
    const data = hierarchy();
    const repository = new MemoryTopologyRepository([
      data.network,
      data.site,
      data.structure,
      data.level,
      data.room,
      data.cluster,
      ...data.positions,
      data.rack,
    ]);

    const result = await new RackPlacementService(repository).validate(data.positions[1]!.id, {
      width: 600,
      depth: 600,
    });

    expect(result).toEqual({ ok: false, error: 'RACK_FOOTPRINT_COLLISION' });
  });

  it('rejects an asset whose width runs past the final slot', async () => {
    const data = hierarchy();
    const repository = new MemoryTopologyRepository([
      data.network,
      data.site,
      data.structure,
      data.level,
      data.room,
      data.cluster,
      ...data.positions,
    ]);

    const result = await new RackPlacementService(repository).validate(data.positions[3]!.id, {
      width: 900,
      depth: 600,
    });

    expect(result).toEqual({ ok: false, error: 'RACK_WIDTH_EXCEEDS_CLUSTER_RUN' });
  });
});
