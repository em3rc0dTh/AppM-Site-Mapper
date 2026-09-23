import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import type { PowerRepository } from '@/modules/power/application/power-repository';
import { PowerService } from '@/modules/power/application/power-service';
import { CasService } from '@/modules/rack/application/cas-service';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import {
  TopologyService,
  type CreateTopologyNodeInput,
} from '@/modules/topology/application/topology-service';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
  RoomSubstructureNode,
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';

const DEMO_NETWORK_NAME = 'MK1 Demo Network';

export interface DemoSeedSummary {
  readonly alreadyPresent: boolean;
  readonly networkId: string;
  readonly roomId: string;
  readonly rackIds: readonly string[];
  readonly inventoryIds: readonly string[];
  readonly powerPathIds: readonly string[];
  readonly links: Readonly<{
    workspace: string;
    network: string;
    blueprint: string;
    rackA01: string;
    power: string;
    telemetry: string;
  }>;
}

function expectKind<K extends TopologyKind>(
  node: TopologyNode,
  kind: K,
): Extract<TopologyNode, { kind: K }> {
  if (node.kind !== kind) {
    throw new Error('Demo seed topology kind mismatch.');
  }

  return node as Extract<TopologyNode, { kind: K }>;
}

async function ensureNode(
  repository: TopologyRepository,
  service: TopologyService,
  input: CreateTopologyNodeInput,
): Promise<TopologyNode> {
  const candidates = input.parentId
    ? await repository.listChildren(input.parentId)
    : await repository.listByKind(input.kind);

  const existing = candidates.find(
    (node) => node.kind === input.kind && node.name === input.name && node.lifecycle === 'ACTIVE',
  );

  if (existing) {
    return existing;
  }

  const result = await service.create(input);

  if (!result.ok) {
    throw new Error('Demo seed could not create ' + input.kind + ': ' + result.error);
  }

  return result.value;
}

async function ensureEquipped(
  repository: TopologyRepository,
  rack: ContainerRackNode,
  occupant: DeviceNode | EquipmentNode,
  placement: Readonly<{
    mountStartU: number;
    physicalSizeU: number;
    clearanceTopU?: number;
    clearanceBottomU?: number;
  }>,
): Promise<void> {
  const cas = new CasService(repository);
  let current = expectKind((await repository.getById(rack.id)) as TopologyNode, 'CONTAINER_RACK');

  if (current.cas.some((range) => range.state === 'EQUIPPED' && range.occupantId === occupant.id)) {
    return;
  }

  let allocation = current.cas.find(
    (range) =>
      range.state === 'RESERVED' &&
      range.mountStartU === placement.mountStartU &&
      range.physicalSizeU === placement.physicalSizeU,
  );

  if (!allocation) {
    const reserved = await cas.reserve(rack.id, placement);

    if (!reserved.ok) {
      throw new Error('Demo seed could not reserve rack capacity: ' + reserved.error);
    }

    current = reserved.value;
    allocation = current.cas.find(
      (range) =>
        range.state === 'RESERVED' &&
        range.mountStartU === placement.mountStartU &&
        range.physicalSizeU === placement.physicalSizeU,
    );
  }

  if (!allocation) {
    throw new Error('Demo seed reservation was not materialized.');
  }

  const equipped = await cas.equip(rack.id, allocation.id, occupant.id);

  if (!equipped.ok) {
    throw new Error('Demo seed could not equip rack capacity: ' + equipped.error);
  }
}

async function ensureReserved(
  repository: TopologyRepository,
  rack: ContainerRackNode,
  placement: Readonly<{
    mountStartU: number;
    physicalSizeU: number;
    clearanceTopU?: number;
    clearanceBottomU?: number;
  }>,
): Promise<void> {
  const current = expectKind((await repository.getById(rack.id)) as TopologyNode, 'CONTAINER_RACK');

  if (
    current.cas.some(
      (range) =>
        range.state === 'RESERVED' &&
        range.mountStartU === placement.mountStartU &&
        range.physicalSizeU === placement.physicalSizeU,
    )
  ) {
    return;
  }

  const result = await new CasService(repository).reserve(rack.id, placement);

  if (!result.ok) {
    throw new Error('Demo seed could not create reserved capacity: ' + result.error);
  }
}

export async function seedDevelopmentDemo(
  topologyRepository: TopologyRepository,
  powerRepository: PowerRepository,
): Promise<DemoSeedSummary> {
  const topology = new TopologyService(topologyRepository);
  const spatial = new SpatialService(topologyRepository);
  const inventory = new InventoryService(topologyRepository);
  const existingNetworks = await topologyRepository.listByKind('NETWORK');
  const alreadyPresent = existingNetworks.some(
    (node) => node.lifecycle === 'ACTIVE' && node.name === DEMO_NETWORK_NAME,
  );

  const network = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'NETWORK',
      parentId: null,
      name: DEMO_NETWORK_NAME,
    }),
    'NETWORK',
  );

  const site = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'SITE',
      parentId: network.id,
      name: 'Lima Operations Campus',
    }),
    'SITE',
  );

  const siteBoundary = await spatial.updateBoundary(site.id, [
    { x: 0, y: 0 },
    { x: 7200, y: 0 },
    { x: 7800, y: 1800 },
    { x: 6600, y: 4800 },
    { x: 600, y: 4800 },
    { x: 0, y: 3000 },
  ]);

  if (!siteBoundary.ok) {
    throw new Error('Demo seed could not configure Site boundary: ' + siteBoundary.error);
  }

  const structure = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'STRUCTURE',
      parentId: site.id,
      name: 'Data Center A',
    }),
    'STRUCTURE',
  );

  // Demo truth: this single-floor structure uses the same operational footprint
  // as its only Room. Structure geometry may differ in real data, but the demo
  // must not invent a second footprint without evidence.
  const structureBoundary = await spatial.updateBoundary(structure.id, [
    { x: 0, y: 0 },
    { x: 3600, y: 0 },
    { x: 3600, y: 1200 },
    { x: 3000, y: 1200 },
    { x: 3000, y: 2400 },
    { x: 0, y: 2400 },
  ]);

  if (!structureBoundary.ok) {
    throw new Error('Demo seed could not configure Structure boundary: ' + structureBoundary.error);
  }

  const level = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'LEVEL',
      parentId: structure.id,
      name: 'Level 01',
    }),
    'LEVEL',
  );

  const room = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'ROOM_SUBSTRUCTURE',
      parentId: level.id,
      name: 'Data Hall 01',
      roomVariant: 'ROOM',
    }),
    'ROOM_SUBSTRUCTURE',
  );

  const polygonResult = await spatial.updateRoomPolygon(room.id, [
    { x: 0, y: 0 },
    { x: 3600, y: 0 },
    { x: 3600, y: 1200 },
    { x: 3000, y: 1200 },
    { x: 3000, y: 2400 },
    { x: 0, y: 2400 },
  ]);

  if (!polygonResult.ok) {
    throw new Error('Demo seed could not configure Blueprint room: ' + polygonResult.error);
  }

  const bayA = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_CLUSTER_BAY',
      parentId: room.id,
      name: 'Bay A',
      clusterVariant: 'BAY',
    }),
    'CONTAINER_CLUSTER_BAY',
  );

  const bayB = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_CLUSTER_BAY',
      parentId: room.id,
      name: 'Bay B',
      clusterVariant: 'BAY',
    }),
    'CONTAINER_CLUSTER_BAY',
  );

  const positionA01 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'POSITION',
      parentId: bayA.id,
      name: 'Position A01',
      coordinate: { row: 'A', column: 1 },
    }),
    'POSITION',
  );

  const positionA02 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'POSITION',
      parentId: bayA.id,
      name: 'Position A02',
      coordinate: { row: 'A', column: 2 },
    }),
    'POSITION',
  );

  const positionB01 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'POSITION',
      parentId: bayB.id,
      name: 'Position B01',
      coordinate: { row: 'B', column: 1 },
    }),
    'POSITION',
  );

  const rackA01 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_RACK',
      parentId: positionA01.id,
      name: 'RACK-A01',
      containerVariant: 'RACK',
      totalU: 42,
      dimensionsMm: { width: 600, depth: 600 },
    }),
    'CONTAINER_RACK',
  );

  const rackA02 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_RACK',
      parentId: positionA02.id,
      name: 'RACK-A02',
      containerVariant: 'RACK',
      totalU: 42,
      dimensionsMm: { width: 900, depth: 600 },
    }),
    'CONTAINER_RACK',
  );

  const rackB01 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_RACK',
      parentId: positionB01.id,
      name: 'RACK-B01',
      containerVariant: 'RACK',
      totalU: 24,
      dimensionsMm: { width: 1200, depth: 600 },
    }),
    'CONTAINER_RACK',
  );

  const bdfb = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'DEVICE',
      parentId: rackA01.id,
      name: 'BDFB-A',
      serialNumber: 'BDFB-DEMO-001',
      category: 'Power Distribution',
    }),
    'DEVICE',
  );

  const compute = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'DEVICE',
      parentId: rackB01.id,
      name: 'Compute Node 01',
      serialNumber: 'SRV-DEMO-001',
      category: 'Compute',
    }),
    'DEVICE',
  );

  const router = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'EQUIPMENT',
      parentId: rackA02.id,
      name: 'Edge Router 01',
      serialNumber: 'RTR-DEMO-001',
      category: 'Network',
    }),
    'EQUIPMENT',
  );

  const patchPanel = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'EQUIPMENT',
      parentId: rackA02.id,
      name: 'Legacy Patch Panel 01',
      category: 'Passive Network',
    }),
    'EQUIPMENT',
  );

  await inventory.setPinned(bdfb.id, true);
  await inventory.setPinned(router.id, true);

  const bdfbResult = await new BdfbService(topologyRepository).configure(bdfb.id, {
    shelves: [
      {
        id: 'demo-shelf-a',
        label: 'Shelf A',
        frames: [
          {
            id: 'demo-frame-a',
            label: 'Frame A',
            presentation: { physicalFrameVisible: false },
            panels: [
              {
                id: 'demo-panel-a',
                label: 'Panel A',
                endpoints: [
                  {
                    id: 'demo-breaker-a1',
                    variant: 'BREAKER',
                    label: 'Breaker A1',
                    capacity: 20,
                  },
                  {
                    id: 'demo-breaker-a2',
                    variant: 'BREAKER',
                    label: 'Breaker A2',
                    capacity: 20,
                  },
                  {
                    id: 'demo-holder-a3',
                    variant: 'HOLDER',
                    label: 'Holder A3',
                  },
                  {
                    id: 'demo-holder-a4',
                    variant: 'HOLDER',
                    label: 'Holder A4',
                  },
                ],
              },
              {
                id: 'demo-panel-b',
                label: 'Panel B',
                endpoints: [
                  {
                    id: 'demo-breaker-b1',
                    variant: 'BREAKER',
                    label: 'Breaker B1',
                    capacity: 30,
                  },
                  {
                    id: 'demo-holder-b2',
                    variant: 'HOLDER',
                    label: 'Holder B2',
                  },
                  {
                    id: 'demo-holder-b3',
                    variant: 'HOLDER',
                    label: 'Holder B3',
                  },
                  {
                    id: 'demo-holder-b4',
                    variant: 'HOLDER',
                    label: 'Holder B4',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!bdfbResult.ok) {
    throw new Error('Demo seed could not configure BDFB: ' + bdfbResult.error);
  }

  await ensureEquipped(topologyRepository, rackA01, bdfb, {
    mountStartU: 34,
    physicalSizeU: 6,
    clearanceTopU: 1,
    clearanceBottomU: 1,
  });
  await ensureEquipped(topologyRepository, rackB01, compute, {
    mountStartU: 10,
    physicalSizeU: 2,
    clearanceTopU: 1,
  });
  await ensureEquipped(topologyRepository, rackA02, router, {
    mountStartU: 20,
    physicalSizeU: 1,
    clearanceTopU: 1,
  });
  await ensureEquipped(topologyRepository, rackA02, patchPanel, {
    mountStartU: 12,
    physicalSizeU: 2,
  });
  await ensureReserved(topologyRepository, rackA02, {
    mountStartU: 30,
    physicalSizeU: 4,
    clearanceTopU: 1,
    clearanceBottomU: 1,
  });

  const power = new PowerService(topologyRepository, powerRepository);
  const activePaths = await powerRepository.listActive();

  async function ensurePowerPath(
    label: string,
    feed: 'A' | 'B',
    breakerHolderId: string,
    targetId: string,
  ): Promise<string> {
    const existing = activePaths.find(
      (path) => path.label === label && path.lifecycle === 'ACTIVE',
    );

    if (existing) {
      return existing.id;
    }

    const result = await power.create({
      source: {
        entityId: bdfb.id,
        internal: {
          shelfId: 'demo-shelf-a',
          frameId: 'demo-frame-a',
          panelId: 'demo-panel-a',
          breakerHolderId,
        },
      },
      target: { entityId: targetId },
      feed,
      label,
    });

    if (!result.ok) {
      throw new Error('Demo seed could not create power path: ' + result.error);
    }

    return result.value.id;
  }

  const powerPathIds = [
    await ensurePowerPath('Feed A · Compute Node 01', 'A', 'demo-breaker-a1', compute.id),
    await ensurePowerPath('Feed B · Edge Router 01', 'B', 'demo-breaker-a2', router.id),
  ];

  return {
    alreadyPresent,
    networkId: network.id,
    roomId: room.id,
    rackIds: [rackA01.id, rackA02.id, rackB01.id],
    inventoryIds: [bdfb.id, compute.id, router.id, patchPanel.id],
    powerPathIds,
    links: {
      workspace: '/workspace',
      network: '/network',
      blueprint: '/blueprint/' + room.id,
      rackA01: '/rack/' + rackA01.id,
      power: '/power',
      telemetry: '/telemetry',
    },
  };
}
