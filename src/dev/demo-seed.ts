import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import type { PowerRepository } from '@/modules/power/application/power-repository';
import { PowerService } from '@/modules/power/application/power-service';
import { CasService } from '@/modules/rack/application/cas-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import {
  TopologyService,
  type CreateTopologyNodeInput,
} from '@/modules/topology/application/topology-service';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';

const DEMO_NETWORK_NAME = 'Network';

const DEMO_SITE_BOUNDARY = [
  { x: 0, y: 0 },
  { x: 7200, y: 0 },
  { x: 7200, y: 6000 },
  { x: 0, y: 6000 },
] as const;

const DEMO_STRUCTURE_BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6600, y: 0 },
  { x: 6600, y: 5400 },
  { x: 0, y: 5400 },
] as const;

const ROOM_201_BOUNDARY = [
  { x: 600, y: 600 },
  { x: 2400, y: 600 },
  { x: 2400, y: 1500 },
  { x: 600, y: 1500 },
] as const;

const ROOM_202_BOUNDARY = [
  { x: 600, y: 600 },
  { x: 6000, y: 300 },
  { x: 6000, y: 4800 },
  { x: 300, y: 4800 },
  { x: 250, y: 1800 },
] as const;

const ROOM_203_BOUNDARY = [
  { x: 600, y: 1900 },
  { x: 2500, y: 1900 },
  { x: 2500, y: 3000 },
  { x: 600, y: 3000 },
] as const;

const ROOM_204_BOUNDARY = [
  { x: 2900, y: 1900 },
  { x: 4800, y: 1900 },
  { x: 4800, y: 3000 },
  { x: 2900, y: 3000 },
] as const;

const DEMO1_BOUNDARY = [
  { x: 1200, y: 1800 },
  { x: 4800, y: 1800 },
  { x: 4800, y: 2400 },
  { x: 1200, y: 2400 },
] as const;

const DEMO2_BOUNDARY = [
  { x: 1200, y: 3000 },
  { x: 5400, y: 3000 },
  { x: 5400, y: 3600 },
  { x: 1200, y: 3600 },
] as const;

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
  if (node.kind !== kind) throw new Error('Demo seed topology kind mismatch.');
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
  if (existing) return existing;

  const result = await service.create(input);
  if (!result.ok) throw new Error('Demo seed could not create ' + input.kind + ': ' + result.error);
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

  if (current.cas.some((range) => range.state === 'EQUIPPED' && range.occupantId === occupant.id))
    return;

  let allocation = current.cas.find(
    (range) =>
      range.state === 'RESERVED' &&
      range.mountStartU === placement.mountStartU &&
      range.physicalSizeU === placement.physicalSizeU,
  );

  if (!allocation) {
    const reserved = await cas.reserve(rack.id, placement);
    if (!reserved.ok)
      throw new Error('Demo seed could not reserve rack capacity: ' + reserved.error);
    current = reserved.value;
    allocation = current.cas.find(
      (range) =>
        range.state === 'RESERVED' &&
        range.mountStartU === placement.mountStartU &&
        range.physicalSizeU === placement.physicalSizeU,
    );
  }

  if (!allocation) throw new Error('Demo seed reservation was not materialized.');
  const equipped = await cas.equip(rack.id, allocation.id, occupant.id);
  if (!equipped.ok) throw new Error('Demo seed could not equip rack capacity: ' + equipped.error);
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
  )
    return;

  const result = await new CasService(repository).reserve(rack.id, placement);
  if (!result.ok) throw new Error('Demo seed could not create reserved capacity: ' + result.error);
}

async function createDevice(
  repository: TopologyRepository,
  topology: TopologyService,
  rack: ContainerRackNode,
  name: string,
  category: string,
  serialNumber: string,
): Promise<DeviceNode> {
  return expectKind(
    await ensureNode(repository, topology, {
      kind: 'DEVICE',
      parentId: rack.id,
      name,
      category,
      serialNumber,
    }),
    'DEVICE',
  );
}

function breakers(prefix: string, count: number, capacity = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: `demo-breaker-${prefix}-${index + 1}`,
    variant: 'BREAKER' as const,
    label: `BRK-${String(index + 1).padStart(2, '0')}`,
    capacity,
  }));
}

async function configureBdfb(
  repository: TopologyRepository,
  device: DeviceNode,
  side: 'A' | 'B',
): Promise<void> {
  const result = await new BdfbService(repository).configure(device.id, {
    shelves: [
      {
        id: `demo-shelf-${side.toLowerCase()}`,
        label: 'Shelf 01',
        frames: [
          {
            id: `demo-frame-${side.toLowerCase()}-a`,
            label: 'Frame A',
            panels: [
              { id: 'demo-panel-a1', label: 'A1', endpoints: breakers('a1', 36) },
              { id: 'demo-panel-a2', label: 'A2', endpoints: breakers('a2', 12) },
              { id: 'demo-panel-a3', label: 'A3', endpoints: breakers('a3', 12) },
            ],
          },
          {
            id: `demo-frame-${side.toLowerCase()}-b`,
            label: 'Frame B',
            panels: [
              { id: 'demo-panel-b1', label: 'B1', endpoints: breakers('b1', 36, 30) },
              { id: 'demo-panel-b2', label: 'B2', endpoints: breakers('b2', 12, 30) },
              { id: 'demo-panel-b3', label: 'B3', endpoints: breakers('b3', 12, 30) },
            ],
          },
        ],
      },
      {
        id: `demo-shelf-${side.toLowerCase()}-2`,
        label: 'Shelf 02',
        frames: [],
      },
    ],
  });
  if (!result.ok) throw new Error('Demo seed could not configure BDFB: ' + result.error);
}

export async function seedDevelopmentDemo(
  topologyRepository: TopologyRepository,
  powerRepository: PowerRepository,
): Promise<DemoSeedSummary> {
  const topology = new TopologyService(topologyRepository);
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

  const lima = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'SITE',
      parentId: network.id,
      name: 'Lima',
      polygon: DEMO_SITE_BOUNDARY,
    }),
    'SITE',
  );
  await ensureNode(topologyRepository, topology, {
    kind: 'SITE',
    parentId: network.id,
    name: 'Arequipa',
    polygon: DEMO_SITE_BOUNDARY,
  });
  await ensureNode(topologyRepository, topology, {
    kind: 'SITE',
    parentId: network.id,
    name: 'Trujillo',
    polygon: DEMO_SITE_BOUNDARY,
  });

  const buildingA = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'STRUCTURE',
      parentId: lima.id,
      name: 'Building A',
      polygon: DEMO_STRUCTURE_BOUNDARY,
    }),
    'STRUCTURE',
  );
  await ensureNode(topologyRepository, topology, {
    kind: 'STRUCTURE',
    parentId: lima.id,
    name: 'Building B',
    polygon: DEMO_STRUCTURE_BOUNDARY,
  });
  await ensureNode(topologyRepository, topology, {
    kind: 'STRUCTURE',
    parentId: lima.id,
    name: 'DC Hall',
    polygon: DEMO_STRUCTURE_BOUNDARY,
  });

  const basement = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'LEVEL',
      parentId: buildingA.id,
      name: 'Basement',
    }),
    'LEVEL',
  );
  const level01 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'LEVEL',
      parentId: buildingA.id,
      name: 'Level 01',
    }),
    'LEVEL',
  );
  const level02 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'LEVEL',
      parentId: buildingA.id,
      name: 'Level 02',
    }),
    'LEVEL',
  );
  const level03 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'LEVEL',
      parentId: buildingA.id,
      name: 'Level 03',
    }),
    'LEVEL',
  );
  void basement;
  void level01;
  void level03;

  const room201 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'ROOM_SUBSTRUCTURE',
      parentId: level02.id,
      name: 'Room 201',
      roomVariant: 'ROOM',
      polygon: ROOM_201_BOUNDARY,
    }),
    'ROOM_SUBSTRUCTURE',
  );
  const room202 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'ROOM_SUBSTRUCTURE',
      parentId: level02.id,
      name: 'Room 202',
      roomVariant: 'ROOM',
      polygon: ROOM_202_BOUNDARY,
    }),
    'ROOM_SUBSTRUCTURE',
  );
  const room203 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'ROOM_SUBSTRUCTURE',
      parentId: level02.id,
      name: 'Room 203',
      roomVariant: 'ROOM',
      polygon: ROOM_203_BOUNDARY,
    }),
    'ROOM_SUBSTRUCTURE',
  );
  const room204 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'ROOM_SUBSTRUCTURE',
      parentId: level02.id,
      name: 'Room 204',
      roomVariant: 'ROOM',
      polygon: ROOM_204_BOUNDARY,
    }),
    'ROOM_SUBSTRUCTURE',
  );

  const bay = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_CLUSTER_BAY',
      parentId: room202.id,
      name: 'DEMO1',
      clusterVariant: 'BAY',
      polygon: DEMO1_BOUNDARY,
    }),
    'CONTAINER_CLUSTER_BAY',
  );
  const demo2 = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_CLUSTER_BAY',
      parentId: room202.id,
      name: 'DEMO2',
      clusterVariant: 'BAY',
      polygon: DEMO2_BOUNDARY,
    }),
    'CONTAINER_CLUSTER_BAY',
  );
  for (let column = 3; column <= 9; column += 1) {
    await ensureNode(topologyRepository, topology, {
      kind: 'POSITION',
      parentId: demo2.id,
      name: `Position F0${column}`,
      coordinate: { row: 'F', column },
    });
  }

  const rackSpecs = [
    ['R-021', 'D', 3],
    ['R-022', 'D', 4],
    ['R-023', 'D', 5],
    ['R-024', 'D', 6],
    ['R-025', 'D', 7],
  ] as const;
  const racks: ContainerRackNode[] = [];
  for (const [name, row, column] of rackSpecs) {
    const position = expectKind(
      await ensureNode(topologyRepository, topology, {
        kind: 'POSITION',
        parentId: bay.id,
        name: `Position ${row}0${column}`,
        coordinate: { row, column },
      }),
      'POSITION',
    );
    const rack = expectKind(
      await ensureNode(topologyRepository, topology, {
        kind: 'CONTAINER_RACK',
        parentId: position.id,
        name,
        containerVariant: 'RACK',
        totalU: 42,
      }),
      'CONTAINER_RACK',
    );
    racks.push(rack);
  }

  const [rack021, rack022, rack023] = racks;
  if (!rack021 || !rack022 || !rack023) throw new Error('Demo rack scenario incomplete.');

  const server01 = await createDevice(
    topologyRepository,
    topology,
    rack023,
    'SERVER-01',
    'Compute',
    'SRV-001',
  );
  const server02 = await createDevice(
    topologyRepository,
    topology,
    rack023,
    'SERVER-02',
    'Compute',
    'SRV-002',
  );
  const server03 = await createDevice(
    topologyRepository,
    topology,
    rack023,
    'SERVER-03',
    'Compute',
    'SRV-003',
  );
  const switch01 = await createDevice(
    topologyRepository,
    topology,
    rack023,
    'SWITCH-01',
    'Network',
    'SWT-001',
  );
  const pduA = await createDevice(
    topologyRepository,
    topology,
    rack023,
    'PDU-A',
    'Power',
    'PDU-A-001',
  );
  const pduB = await createDevice(
    topologyRepository,
    topology,
    rack023,
    'PDU-B',
    'Power',
    'PDU-B-001',
  );
  const bdfbA = await createDevice(
    topologyRepository,
    topology,
    rack021,
    'BDFB-A',
    'Power Distribution',
    'BDFB-A-001',
  );
  const bdfbB = await createDevice(
    topologyRepository,
    topology,
    rack022,
    'BDFB-B',
    'Power Distribution',
    'BDFB-B-001',
  );

  await Promise.all([inventory.setPinned(rack023.id, true), inventory.setPinned(bdfbA.id, true)]);

  await configureBdfb(topologyRepository, bdfbA, 'A');
  await configureBdfb(topologyRepository, bdfbB, 'B');

  await ensureEquipped(topologyRepository, rack023, server01, {
    mountStartU: 41,
    physicalSizeU: 2,
  });
  await ensureEquipped(topologyRepository, rack023, server02, {
    mountStartU: 37,
    physicalSizeU: 2,
  });
  await ensureEquipped(topologyRepository, rack023, server03, {
    mountStartU: 33,
    physicalSizeU: 2,
  });
  await ensureEquipped(topologyRepository, rack023, switch01, {
    mountStartU: 24,
    physicalSizeU: 3,
  });
  await ensureEquipped(topologyRepository, rack023, pduA, { mountStartU: 20, physicalSizeU: 2 });
  await ensureEquipped(topologyRepository, rack023, pduB, { mountStartU: 16, physicalSizeU: 2 });
  await ensureReserved(topologyRepository, rack023, { mountStartU: 28, physicalSizeU: 4 });
  await ensureEquipped(topologyRepository, rack021, bdfbA, { mountStartU: 30, physicalSizeU: 8 });
  await ensureEquipped(topologyRepository, rack022, bdfbB, { mountStartU: 30, physicalSizeU: 8 });

  const power = new PowerService(topologyRepository, powerRepository);
  const activePaths = await powerRepository.listActive();
  async function ensurePowerPath(
    label: string,
    sourceDevice: DeviceNode,
    panelId: string,
    breakerHolderId: string,
    feed: 'A' | 'B',
  ): Promise<string> {
    const existing = activePaths.find(
      (path) => path.label === label && path.lifecycle === 'ACTIVE',
    );
    if (existing) return existing.id;
    const result = await power.create({
      source: {
        entityId: sourceDevice.id,
        internal: {
          shelfId: `demo-shelf-${feed.toLowerCase()}`,
          frameId: `demo-frame-${feed.toLowerCase()}-${feed.toLowerCase()}`,
          panelId,
          breakerHolderId,
        },
      },
      target: { entityId: server01.id },
      feed,
      label,
    });
    if (!result.ok) throw new Error('Demo seed could not create power path: ' + result.error);
    return result.value.id;
  }

  const powerPathIds = [
    await ensurePowerPath('Feed A · SERVER-01', bdfbA, 'demo-panel-a1', 'demo-breaker-a1-8', 'A'),
    await ensurePowerPath('Feed B · SERVER-01', bdfbB, 'demo-panel-b1', 'demo-breaker-b1-11', 'B'),
  ];

  return {
    alreadyPresent,
    networkId: network.id,
    roomId: room202.id,
    rackIds: racks.map((rack) => rack.id),
    inventoryIds: [
      server01.id,
      server02.id,
      server03.id,
      switch01.id,
      pduA.id,
      pduB.id,
      bdfbA.id,
      bdfbB.id,
    ],
    powerPathIds,
    links: {
      workspace: '/workspace',
      network: '/network',
      blueprint: '/blueprint/' + room202.id,
      rackA01: '/rack/' + rack023.id,
      power: '/power',
      telemetry: '/telemetry',
    },
  };
}
