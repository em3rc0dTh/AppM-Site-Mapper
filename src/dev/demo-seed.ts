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
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';

const DEMO_NETWORK_NAME = 'MK1 Demo Network';

const DEMO_SITE_POLYGON = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
] as const;

const DEMO_STRUCTURE_POLYGON = [
  { x: 200, y: 200 },
  { x: 5800, y: 200 },
  { x: 5800, y: 3800 },
  { x: 200, y: 3800 },
] as const;

const DEMO_ROOM_POLYGON = [
  { x: 0, y: 0 },
  { x: 3600, y: 0 },
  { x: 3600, y: 2400 },
  { x: 0, y: 2400 },
] as const;

const DEMO_BAY_A_POLYGON = [
  { x: 0, y: 0 },
  { x: 1800, y: 0 },
  { x: 1800, y: 600 },
  { x: 0, y: 600 },
] as const;

const DEMO_BAY_B_POLYGON = [
  { x: 1800, y: 0 },
  { x: 3600, y: 0 },
  { x: 3600, y: 600 },
  { x: 1800, y: 600 },
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
  occupant: EquipmentNode,
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
  ) {
    return;
  }

  const result = await new CasService(repository).reserve(rack.id, placement);
  if (!result.ok) throw new Error('Demo seed could not create reserved capacity: ' + result.error);
}

async function ensurePowerInputPort(
  repository: TopologyRepository,
  equipment: EquipmentNode,
): Promise<EquipmentNode> {
  const existing = equipment.accessPorts.find(
    (port) =>
      port.lifecycle === 'ACTIVE' && port.portType === 'POWER' && port.direction === 'INPUT',
  );
  if (existing) return equipment;

  const timestamp = nowIso();
  const updated: EquipmentNode = {
    ...equipment,
    accessPorts: [
      ...equipment.accessPorts,
      {
        id: equipment.id + ':power-in',
        deviceId: equipment.deviceId,
        equipmentId: equipment.id,
        name: 'Power input',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
      },
    ],
    updatedAt: timestamp,
  };
  await repository.replace(updated);
  return updated;
}

async function rootEquipment(
  repository: TopologyRepository,
  topology: TopologyService,
  device: DeviceNode,
  name: string,
  equipmentType: 'CHASSIS' | 'NETWORK_BOARD' | 'CUSTOM',
): Promise<EquipmentNode> {
  return expectKind(
    await ensureNode(repository, topology, {
      kind: 'EQUIPMENT',
      parentId: device.id,
      name,
      equipmentType,
    }),
    'EQUIPMENT',
  );
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
  const site = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'SITE',
      parentId: network.id,
      name: 'Lima Operations Campus',
      polygon: DEMO_SITE_POLYGON,
    }),
    'SITE',
  );
  const structure = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'STRUCTURE',
      parentId: site.id,
      name: 'Data Center A',
      polygon: DEMO_STRUCTURE_POLYGON,
    }),
    'STRUCTURE',
  );
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
      polygon: DEMO_ROOM_POLYGON,
    }),
    'ROOM_SUBSTRUCTURE',
  );

  const polygonResult = await new SpatialService(topologyRepository).updateRoomPolygon(
    room.id,
    DEMO_ROOM_POLYGON,
  );
  if (!polygonResult.ok) {
    throw new Error('Demo seed could not configure Blueprint room: ' + polygonResult.error);
  }

  const bayA = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_CLUSTER_BAY',
      parentId: room.id,
      name: 'Bay A',
      clusterVariant: 'BAY',
      polygon: DEMO_BAY_A_POLYGON,
    }),
    'CONTAINER_CLUSTER_BAY',
  );
  const bayB = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'CONTAINER_CLUSTER_BAY',
      parentId: room.id,
      name: 'Bay B',
      clusterVariant: 'BAY',
      polygon: DEMO_BAY_B_POLYGON,
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
      deviceType: 'BDFB',
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
      deviceType: 'SERVER',
    }),
    'DEVICE',
  );
  const router = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'DEVICE',
      parentId: rackA02.id,
      name: 'Edge Router 01',
      serialNumber: 'RTR-DEMO-001',
      category: 'Network',
      deviceType: 'NETWORK_ELEMENT',
    }),
    'DEVICE',
  );
  const patchPanel = expectKind(
    await ensureNode(topologyRepository, topology, {
      kind: 'DEVICE',
      parentId: rackA02.id,
      name: 'Legacy Patch Panel 01',
      category: 'Passive Network',
      deviceType: 'CUSTOM',
    }),
    'DEVICE',
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
            physicalFrameVisible: false,
            panels: [
              {
                id: 'demo-panel-a',
                label: 'Panel A',
                positions: [
                  { id: 'demo-breaker-a1', label: 'Breaker A1', capacity: 20 },
                  { id: 'demo-breaker-a2', label: 'Breaker A2', capacity: 20 },
                  null,
                  null,
                ],
              },
              {
                id: 'demo-panel-b',
                label: 'Panel B',
                positions: [
                  { id: 'demo-breaker-b1', label: 'Breaker B1', capacity: 30 },
                  null,
                  null,
                  null,
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!bdfbResult.ok && bdfbResult.error !== 'DEVICE_ALREADY_MATERIALIZED') {
    throw new Error('Demo seed could not configure BDFB: ' + bdfbResult.error);
  }

  const currentBdfb = expectKind(
    (await topologyRepository.getById(bdfb.id)) as TopologyNode,
    'DEVICE',
  );
  const chassisId = currentBdfb.rootEquipmentIds[0];
  if (!chassisId) throw new Error('Demo seed BDFB has no root Equipment.');
  const chassis = expectKind(
    (await topologyRepository.getById(chassisId)) as TopologyNode,
    'EQUIPMENT',
  );

  let computeEquipment = await rootEquipment(
    topologyRepository,
    topology,
    compute,
    'Compute Node 01 Chassis',
    'CHASSIS',
  );
  let routerEquipment = await rootEquipment(
    topologyRepository,
    topology,
    router,
    'Edge Router 01 Chassis',
    'CHASSIS',
  );
  const patchPanelEquipment = await rootEquipment(
    topologyRepository,
    topology,
    patchPanel,
    'Patch Panel 01',
    'NETWORK_BOARD',
  );
  computeEquipment = await ensurePowerInputPort(topologyRepository, computeEquipment);
  routerEquipment = await ensurePowerInputPort(topologyRepository, routerEquipment);

  await ensureEquipped(topologyRepository, rackA01, chassis, {
    mountStartU: 34,
    physicalSizeU: 6,
    clearanceTopU: 1,
    clearanceBottomU: 1,
  });
  await ensureEquipped(topologyRepository, rackB01, computeEquipment, {
    mountStartU: 10,
    physicalSizeU: 2,
    clearanceTopU: 1,
  });
  await ensureEquipped(topologyRepository, rackA02, routerEquipment, {
    mountStartU: 20,
    physicalSizeU: 1,
    clearanceTopU: 1,
  });
  await ensureEquipped(topologyRepository, rackA02, patchPanelEquipment, {
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
    breakerId: string,
    target: EquipmentNode,
  ): Promise<string> {
    const existing = activePaths.find(
      (path) => path.label === label && path.lifecycle === 'ACTIVE',
    );
    if (existing) return existing.id;

    const sourceAccessPortId = bdfb.id + ':equipment:' + breakerId + ':power-out';
    const targetAccessPortId = target.id + ':power-in';
    const result = await power.create({ sourceAccessPortId, targetAccessPortId, feed, label });
    if (!result.ok) throw new Error('Demo seed could not create power path: ' + result.error);
    return result.value.id;
  }

  const powerPathIds = [
    await ensurePowerPath('Feed A · Compute Node 01', 'A', 'demo-breaker-a1', computeEquipment),
    await ensurePowerPath('Feed B · Edge Router 01', 'B', 'demo-breaker-a2', routerEquipment),
  ];

  return {
    alreadyPresent,
    networkId: network.id,
    roomId: room.id,
    rackIds: [rackA01.id, rackA02.id, rackB01.id],
    inventoryIds: [
      bdfb.id,
      compute.id,
      router.id,
      patchPanel.id,
      chassis.id,
      computeEquipment.id,
      routerEquipment.id,
      patchPanelEquipment.id,
    ],
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
