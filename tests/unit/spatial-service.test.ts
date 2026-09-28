import { describe, expect, it } from 'vitest';

import { SpatialService } from '@/modules/spatial/application/spatial-service';
import type {
  ContainerClusterBayNode,
  ContainerRackNode,
  PositionNode,
  RoomSubstructureNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-28T00:00:00.000Z';

const room: RoomSubstructureNode = {
  id: 'room-1',
  kind: 'ROOM_SUBSTRUCTURE',
  parentId: 'level-1',
  name: 'Sala de Transmisiones',
  lifecycle: 'ACTIVE',
  variant: 'ROOM',
  polygon: [
    { x: 0, y: 0 },
    { x: 1800, y: 0 },
    { x: 1800, y: 1200 },
    { x: 0, y: 1200 },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const cluster: ContainerClusterBayNode = {
  id: 'cluster-1',
  kind: 'CONTAINER_CLUSTER_BAY',
  parentId: room.id,
  name: 'Demo1',
  lifecycle: 'ACTIVE',
  variant: 'CONTAINER_CLUSTER',
  polygon: [
    { x: 0, y: 0 },
    { x: 1200, y: 0 },
    { x: 1200, y: 600 },
    { x: 0, y: 600 },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const position: PositionNode = {
  id: 'position-1',
  kind: 'POSITION',
  parentId: cluster.id,
  name: 'A-1',
  lifecycle: 'ACTIVE',
  coordinate: { row: 'A', column: 1 },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const rack: ContainerRackNode = {
  id: 'rack-1',
  kind: 'CONTAINER_RACK',
  parentId: position.id,
  name: 'RACK-EATON-01',
  lifecycle: 'ACTIVE',
  variant: 'RACK',
  dimensionsMm: { width: 600, depth: 600 },
  totalU: 42,
  cas: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('SpatialService room audit projection', () => {
  it('preserves cluster -> position -> rack context for focused Room drill-down', async () => {
    const repository = new MemoryTopologyRepository([room, cluster, position, rack]);
    const result = await new SpatialService(repository).getRoomLayout(room.id);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected room layout.');
    }

    expect(result.value.clusters).toEqual([
      expect.objectContaining({ id: cluster.id, name: cluster.name }),
    ]);
    expect(result.value.positions).toEqual([
      expect.objectContaining({
        id: position.id,
        clusterId: cluster.id,
        coordinate: position.coordinate,
        rect: { x: 0, y: 0, width: 600, depth: 600 },
      }),
    ]);
    expect(result.value.racks).toEqual([
      expect.objectContaining({
        id: rack.id,
        clusterId: cluster.id,
        positionId: position.id,
        rect: { x: 0, y: 0, width: 600, depth: 600 },
      }),
    ]);
  });
});
