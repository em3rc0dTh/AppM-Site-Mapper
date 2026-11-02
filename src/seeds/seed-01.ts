import type { ClientSession, Db, Document } from 'mongodb';

import type { CommunicationProfile } from '@/modules/industrial/domain/commissioning';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';
import { MongoTopologyRepository } from '@/modules/topology/infrastructure/mongo-topology-repository';
import { CasService } from '@/modules/rack/application/cas-service';
import { withIntegrityTransaction } from '@/shared/infrastructure/mongodb/integrity-transaction';

export const SEED_01_PROFILE = 'seed-01' as const;
export const SEED_01_VERSION = 5 as const;

const PANELS = ['A3', 'A2', 'A1', 'B3', 'B2', 'B1'] as const;
type PanelName = (typeof PANELS)[number];
type MeterPanelName = 'A3' | 'A2' | 'B3' | 'B2';

interface MeterSpec {
  readonly panel: MeterPanelName;
  readonly serial: string;
  readonly slaveId: number;
}

interface BreakerSpec {
  readonly panel: 'A3' | 'B3';
  readonly position: number;
  readonly destination: string;
}

interface BdfbSpec {
  readonly key: 'QDF-2' | 'QDF-4' | 'QDF-5';
  readonly rackNames: readonly string[];
  readonly rackLocation: string;
  readonly gatewaySerial: string;
  readonly meters: readonly MeterSpec[];
  readonly breakers: readonly BreakerSpec[];
}

const QDF_4_BREAKERS: readonly BreakerSpec[] = [
  { panel: 'A3', position: 1, destination: 'BB-LUR-04 SH2 A1' },
  { panel: 'B3', position: 1, destination: 'BB-LUR-04 SH2 FEED B1' },
  { panel: 'A3', position: 2, destination: 'BB-LUR-04 SH2 A2' },
  { panel: 'B3', position: 2, destination: 'BB-LUR-04 SH2 FEED B2' },
  { panel: 'A3', position: 3, destination: 'PL-LUR-FPN3-1 SH20 FEED A' },
  { panel: 'B3', position: 3, destination: 'PL-LUR-FPN3-1 SH20 FEED B' },
  { panel: 'A3', position: 4, destination: 'DTN-LUR-FP4-01 SH1 A' },
  { panel: 'B3', position: 4, destination: 'DTN-LUR-FP4-01 SH1 B' },
  { panel: 'A3', position: 5, destination: 'DTN-LUR-FP4-01 SH2 A' },
  { panel: 'B3', position: 5, destination: 'DTN-LUR-FP4-01 SH2 B' },
  { panel: 'A3', position: 6, destination: 'BB-LUR-FPN3-3 SH17 FEED A' },
  { panel: 'B3', position: 6, destination: 'BB-LUR-FPN3-3 SH17 FEED B' },
];

const QDF_5_BREAKERS: readonly BreakerSpec[] = [
  { panel: 'A3', position: 1, destination: 'WS-LUR-04 PS1' },
  { panel: 'B3', position: 1, destination: 'WS-LUR-04 PS2' },
  { panel: 'A3', position: 2, destination: 'WS-LUR-01 PSU1' },
  { panel: 'B3', position: 2, destination: 'WS-LUR-01 PSU2' },
  { panel: 'A3', position: 3, destination: 'GXLUR02 SH01 PEM1' },
  { panel: 'B3', position: 3, destination: 'GXLUR02 SH1 PEM3' },
  { panel: 'A3', position: 4, destination: 'GXLUR02 SH01 PEM2' },
  { panel: 'B3', position: 4, destination: 'GXLUR02 SH1 PEM4' },
  { panel: 'A3', position: 5, destination: 'GXLUR01 SH2 PEM1' },
  { panel: 'B3', position: 5, destination: 'GXLUR01 SH2 PEM3' },
  { panel: 'A3', position: 6, destination: 'GXLUR01 SH2 PEM2' },
  { panel: 'B3', position: 6, destination: 'GXLUR01 SH2 PEM4' },
  { panel: 'A3', position: 7, destination: 'WS-LUR-02 L1' },
  { panel: 'B3', position: 7, destination: 'WS-LUR-02 L2' },
  { panel: 'A3', position: 8, destination: 'CAR-LUR-01 L1' },
  { panel: 'B3', position: 8, destination: 'CAR-LUR-01 L2' },
  { panel: 'A3', position: 9, destination: 'WS-LUR-03 L1' },
  { panel: 'B3', position: 9, destination: 'WS-LUR-03 L2' },
  { panel: 'A3', position: 10, destination: 'DTX-LUR-FP2-1 SH8 PA1-1' },
  { panel: 'B3', position: 10, destination: 'DTX-LUR-FP2-1 SH8 PB1-1' },
  { panel: 'A3', position: 11, destination: 'DTX-LUR-FP2-1 SH8 PA1-2' },
  { panel: 'B3', position: 11, destination: 'DTX-LUR-FP2-1 SH8 PB1-2' },
  { panel: 'A3', position: 12, destination: 'DTX-LUR-FP2-1 SH8 PA2-1' },
  { panel: 'B3', position: 12, destination: 'DTX-LUR-FP2-1 SH8 PB2-1' },
  { panel: 'A3', position: 13, destination: 'DTX-LUR-FP2-1 SH8 PA2-2' },
  { panel: 'B3', position: 13, destination: 'DTX-LUR-FP2-1 SH8 PB2-2' },
  { panel: 'A3', position: 14, destination: 'DTX-LUR-FP2-1 SH8 PA3-1' },
  { panel: 'B3', position: 14, destination: 'DTX-LUR-FP2-1 SH8 PB3-1' },
  { panel: 'A3', position: 15, destination: 'DTX-LUR-FP2-1 SH8 PA3-2' },
  { panel: 'B3', position: 15, destination: 'DTX-LUR-FP2-1 SH8 PB3-2' },
  { panel: 'A3', position: 16, destination: 'PL-LUR-FPO1-1 FEED A' },
  { panel: 'B3', position: 16, destination: 'PL-LUR-FPO1-1 FEED B' },
  { panel: 'A3', position: 17, destination: '010208.14 PDU1-A' },
  { panel: 'B3', position: 17, destination: '010208.14 PDU1-B' },
  { panel: 'A3', position: 18, destination: '010208.13 PDU1-A' },
  { panel: 'B3', position: 18, destination: '010208.13 PDU1-B' },
];

const BDFBS: readonly BdfbSpec[] = [
  {
    key: 'QDF-2',
    rackNames: ['QDF-2', 'QDF2', 'RR 010202.04'],
    rackLocation: 'RR 010202.04',
    gatewaySerial: '26092403950003',
    meters: [
      { panel: 'A3', serial: '26042902290016', slaveId: 1 },
      { panel: 'A2', serial: '26042902290014', slaveId: 3 },
      { panel: 'B3', serial: '26042902290010', slaveId: 5 },
      { panel: 'B2', serial: '26042902290012', slaveId: 7 },
    ],
    // The source workbook lists legacy feeds but does not declare their final
    // positions after migration. Seed-01 therefore materializes no QDF-2 breakers.
    breakers: [],
  },
  {
    key: 'QDF-4',
    rackNames: ['QDF-4', 'QDF4', 'RR 010206.04'],
    rackLocation: 'RR 010206.04',
    gatewaySerial: '26092403950004',
    meters: [
      { panel: 'A3', serial: '26042902290011', slaveId: 1 },
      { panel: 'A2', serial: '26042902290007', slaveId: 3 },
      { panel: 'B3', serial: '26042902290018', slaveId: 5 },
      { panel: 'B2', serial: '26042902290015', slaveId: 7 },
    ],
    breakers: QDF_4_BREAKERS,
  },
  {
    key: 'QDF-5',
    rackNames: ['QDF-5', 'QDF5', 'RR 010208.04'],
    rackLocation: 'RR 010208.04',
    gatewaySerial: '26092403950002',
    meters: [
      { panel: 'A3', serial: '26042902290009', slaveId: 1 },
      { panel: 'A2', serial: '26042902290008', slaveId: 3 },
      { panel: 'B3', serial: '26042902290013', slaveId: 5 },
      { panel: 'B2', serial: '26042902290017', slaveId: 7 },
    ],
    breakers: QDF_5_BREAKERS,
  },
];

const BASE = {
  network: 'TELXIUS LURIN',
  site: 'TELXIUS LURIN CABLE LANDING STATION',
  structure: 'EDIFICIO PRINCIPAL',
  level: 'LEVEL 00',
  room: 'SALA DE TRANSMISIONES',
  qdfBay: 'QDF POWER DISTRIBUTION',
} as const;

const BASE_SITE_POLYGON = [
  { x: 0, y: 0 },
  { x: 10000, y: 0 },
  { x: 10000, y: 8000 },
  { x: 0, y: 8000 },
] as const;

const BASE_STRUCTURE_POLYGON = [
  { x: 500, y: 500 },
  { x: 9500, y: 500 },
  { x: 9500, y: 7500 },
  { x: 500, y: 7500 },
] as const;

const BASE_ROOM_POLYGON = [
  { x: 1000, y: 1000 },
  { x: 9000, y: 1000 },
  { x: 9000, y: 7000 },
  { x: 1000, y: 7000 },
] as const;

const BASE_QDF_BAY_POLYGON = [
  { x: 1500, y: 1500 },
  { x: 8500, y: 1500 },
  { x: 8500, y: 3000 },
  { x: 1500, y: 3000 },
] as const;

export interface Seed01Summary {
  readonly profile: typeof SEED_01_PROFILE;
  readonly version: typeof SEED_01_VERSION;
  readonly alreadyApplied: boolean;
  readonly roomId: string;
  readonly bdfbs: readonly {
    readonly key: BdfbSpec['key'];
    readonly rackId: string;
    readonly deviceId: string;
    readonly breakerCount: number;
  }[];
}

type Seed01StateDocument = Document & {
  readonly _id: typeof SEED_01_PROFILE;
  readonly profile: typeof SEED_01_PROFILE;
  readonly version: number;
  readonly status: 'APPLIED';
  readonly appliedAt: string;
  readonly roomId: string;
  readonly bdfbs: Seed01Summary['bdfbs'];
};

function normalizedName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function expectKind<K extends TopologyKind>(
  node: TopologyNode,
  kind: K,
  context: string,
): Extract<TopologyNode, { kind: K }> {
  if (node.kind !== kind) {
    throw new Error(`SEED_01_CONFLICT: ${context} expected ${kind}, got ${node.kind}`);
  }
  return node as Extract<TopologyNode, { kind: K }>;
}

function exactlyOne<T>(items: readonly T[], context: string): T {
  if (items.length !== 1) {
    throw new Error(`SEED_01_BASE_REQUIRED: ${context}; found ${items.length}`);
  }
  return items[0]!;
}

async function resolveNamedChild<K extends TopologyKind>(
  repository: TopologyRepository,
  parentId: string,
  kind: K,
  name: string,
): Promise<Extract<TopologyNode, { kind: K }>> {
  const expected = normalizedName(name);
  const children = (await repository.listChildren(parentId)).filter(
    (node) =>
      node.lifecycle === 'ACTIVE' && node.kind === kind && normalizedName(node.name) === expected,
  );
  return expectKind(exactlyOne(children, `${kind} ${name}`), kind, name);
}

async function createRequiredNode<K extends TopologyKind>(
  topology: TopologyService,
  input: Parameters<TopologyService['create']>[0],
  kind: K,
  context: string,
): Promise<Extract<TopologyNode, { kind: K }>> {
  const result = await topology.create(input);
  if (!result.ok) {
    throw new Error(`SEED_01_CREATE_FAILED: ${context}: ${result.error}`);
  }
  return expectKind(result.value, kind, context);
}

async function ensureNamedChild<K extends TopologyKind>(
  repository: TopologyRepository,
  topology: TopologyService,
  parentId: string,
  kind: K,
  name: string,
  createInput: Omit<Parameters<TopologyService['create']>[0], 'kind' | 'parentId' | 'name'>,
): Promise<Extract<TopologyNode, { kind: K }>> {
  const expected = normalizedName(name);
  const matches = (await repository.listChildren(parentId)).filter(
    (node) =>
      node.lifecycle === 'ACTIVE' && node.kind === kind && normalizedName(node.name) === expected,
  );
  if (matches.length > 1) {
    throw new Error(`SEED_01_CONFLICT: duplicate ${kind} ${name}`);
  }
  if (matches.length === 1) return expectKind(matches[0]!, kind, name);

  return createRequiredNode(topology, { kind, parentId, name, ...createInput }, kind, name);
}

async function ensureBase(
  repository: TopologyRepository,
  topology: TopologyService,
): Promise<{
  readonly room: Extract<TopologyNode, { kind: 'ROOM_SUBSTRUCTURE' }>;
  readonly racks: ReadonlyMap<BdfbSpec['key'], ContainerRackNode>;
}> {
  const activeSites = (await repository.listByKind('SITE')).filter(
    (node) =>
      node.lifecycle === 'ACTIVE' && normalizedName(node.name) === normalizedName(BASE.site),
  );
  if (activeSites.length > 1) {
    throw new Error(`SEED_01_CONFLICT: duplicate SITE ${BASE.site}`);
  }

  let site: Extract<TopologyNode, { kind: 'SITE' }>;
  if (activeSites.length === 1) {
    site = expectKind(activeSites[0]!, 'SITE', BASE.site);
  } else {
    const networks = (await repository.listByKind('NETWORK')).filter(
      (node) =>
        node.lifecycle === 'ACTIVE' && normalizedName(node.name) === normalizedName(BASE.network),
    );
    if (networks.length > 1) {
      throw new Error(`SEED_01_CONFLICT: duplicate NETWORK ${BASE.network}`);
    }
    const network =
      networks.length === 1
        ? expectKind(networks[0]!, 'NETWORK', BASE.network)
        : await createRequiredNode(
            topology,
            { kind: 'NETWORK', parentId: null, name: BASE.network },
            'NETWORK',
            BASE.network,
          );
    site = await createRequiredNode(
      topology,
      {
        kind: 'SITE',
        parentId: network.id,
        name: BASE.site,
        polygon: BASE_SITE_POLYGON,
      },
      'SITE',
      BASE.site,
    );
  }

  const structure = await ensureNamedChild(
    repository,
    topology,
    site.id,
    'STRUCTURE',
    BASE.structure,
    { polygon: BASE_STRUCTURE_POLYGON },
  );
  const level = await ensureNamedChild(repository, topology, structure.id, 'LEVEL', BASE.level, {});
  const room = await ensureNamedChild(
    repository,
    topology,
    level.id,
    'ROOM_SUBSTRUCTURE',
    BASE.room,
    { roomVariant: 'ROOM', polygon: BASE_ROOM_POLYGON },
  );

  const allRacks = (await repository.listByKind('CONTAINER_RACK')).filter(
    (node): node is ContainerRackNode =>
      node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE',
  );
  const racks = new Map<BdfbSpec['key'], ContainerRackNode>();
  const unresolved: BdfbSpec[] = [];

  for (const spec of BDFBS) {
    const aliases = new Set(spec.rackNames.map(normalizedName));
    const candidates: ContainerRackNode[] = [];
    for (const rack of allRacks) {
      if (!aliases.has(normalizedName(rack.name))) continue;
      const trail = await topology.getTrail(rack.id);
      if (trail.some((node) => node.id === room.id)) candidates.push(rack);
    }
    if (candidates.length > 1) {
      throw new Error(`SEED_01_CONFLICT: multiple racks for ${spec.key} inside ${BASE.room}`);
    }
    if (candidates.length === 1) {
      racks.set(spec.key, candidates[0]!);
    } else {
      unresolved.push(spec);
    }
  }

  if (unresolved.length) {
    const bay = await ensureNamedChild(
      repository,
      topology,
      room.id,
      'CONTAINER_CLUSTER_BAY',
      BASE.qdfBay,
      { clusterVariant: 'BAY', polygon: BASE_QDF_BAY_POLYGON },
    );

    for (const spec of unresolved) {
      const coordinateColumn = spec.key === 'QDF-2' ? 2 : spec.key === 'QDF-4' ? 4 : 5;
      const position = await ensureNamedChild(
        repository,
        topology,
        bay.id,
        'POSITION',
        `${spec.key} POSITION`,
        { coordinate: { row: 'QDF', column: coordinateColumn } },
      );
      const rack = await ensureNamedChild(
        repository,
        topology,
        position.id,
        'CONTAINER_RACK',
        spec.key,
        { containerVariant: 'RACK', totalU: 42 },
      );
      racks.set(spec.key, rack);
    }
  }

  return { room, racks };
}
async function ensureBdfbDevice(
  repository: TopologyRepository,
  topology: TopologyService,
  rack: ContainerRackNode,
  spec: BdfbSpec,
): Promise<DeviceNode> {
  const devices = (await repository.listChildren(rack.id)).filter(
    (node): node is DeviceNode =>
      node.kind === 'DEVICE' && node.lifecycle === 'ACTIVE' && node.deviceType === 'BDFB',
  );
  if (devices.length > 1) {
    throw new Error(`SEED_01_CONFLICT: multiple BDFB Devices in rack ${rack.name}`);
  }
  if (devices.length === 1) return devices[0]!;

  const created = await topology.create({
    kind: 'DEVICE',
    parentId: rack.id,
    name: `BDFB ${spec.key}`,
    deviceType: 'BDFB',
    category: `48 VDC power distribution · ${spec.rackLocation}`,
  });
  if (!created.ok || created.value.kind !== 'DEVICE') {
    throw new Error(
      `SEED_01_CREATE_FAILED: BDFB ${spec.key}: ${created.ok ? 'INVALID_KIND' : created.error}`,
    );
  }
  return created.value;
}

interface RootEquipmentSpec {
  readonly name: string;
  readonly equipmentType: EquipmentNode['equipmentType'];
  readonly manufacturer?: string;
  readonly model?: string;
  readonly serialNumber?: string;
  readonly category?: string;
  readonly aliases?: readonly string[];
  readonly childMode?: EquipmentNode['childMode'];
  readonly childCapacity?: number;
  readonly presentation?: NonNullable<EquipmentNode['presentation']>;
}

function validateEquipment(
  equipment: EquipmentNode,
  device: DeviceNode,
  spec: RootEquipmentSpec,
): void {
  if (
    equipment.lifecycle !== 'ACTIVE' ||
    equipment.deviceId !== device.id ||
    equipment.parentEquipmentId !== null ||
    equipment.equipmentType !== spec.equipmentType
  ) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} has incompatible ownership/type`);
  }
  if (spec.serialNumber && equipment.serialNumber !== spec.serialNumber) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} serial mismatch`);
  }
  if (spec.manufacturer && equipment.manufacturer !== spec.manufacturer) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} manufacturer mismatch`);
  }
  if (spec.model && equipment.model !== spec.model) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} model mismatch`);
  }
  if (spec.childMode && equipment.childMode !== spec.childMode) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} child mode mismatch`);
  }
  if (spec.childCapacity !== undefined && equipment.children.length !== spec.childCapacity) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} child capacity mismatch`);
  }
}

async function ensureRootEquipment(
  repository: TopologyRepository,
  topology: TopologyService,
  device: DeviceNode,
  spec: RootEquipmentSpec,
): Promise<EquipmentNode> {
  if (spec.serialNumber) {
    const serialMatches = await repository.findActiveBySerialNumber(spec.serialNumber);
    if (serialMatches.length > 1) {
      throw new Error(`SEED_01_CONFLICT: duplicate active serial ${spec.serialNumber}`);
    }
    if (serialMatches.length === 1) {
      const equipment = expectKind(serialMatches[0]!, 'EQUIPMENT', spec.name);
      validateEquipment(equipment, device, spec);
      return equipment;
    }
  }

  const roots = (await repository.listEquipmentForDevice(device.id)).filter(
    (item) =>
      item.lifecycle === 'ACTIVE' &&
      item.parentEquipmentId === null &&
      normalizedName(item.name) === normalizedName(spec.name),
  );
  if (roots.length > 1) {
    throw new Error(`SEED_01_CONFLICT: duplicate root Equipment ${spec.name}`);
  }
  if (roots.length === 1) {
    validateEquipment(roots[0]!, device, spec);
    return roots[0]!;
  }

  const created = await topology.create({
    kind: 'EQUIPMENT',
    parentId: device.id,
    name: spec.name,
    equipmentType: spec.equipmentType,
    ...(spec.manufacturer ? { manufacturer: spec.manufacturer } : {}),
    ...(spec.model ? { model: spec.model } : {}),
    ...(spec.serialNumber ? { serialNumber: spec.serialNumber } : {}),
    ...(spec.category ? { category: spec.category } : {}),
    ...(spec.aliases?.length ? { aliases: spec.aliases } : {}),
    ...(spec.childMode ? { childMode: spec.childMode } : {}),
    ...(spec.childCapacity ? { childCapacity: spec.childCapacity } : {}),
    ...(spec.presentation ? { presentation: spec.presentation } : {}),
  });
  if (!created.ok || created.value.kind !== 'EQUIPMENT') {
    throw new Error(
      `SEED_01_CREATE_FAILED: Equipment ${spec.name}: ${created.ok ? 'INVALID_KIND' : created.error}`,
    );
  }
  return created.value;
}

async function ensureDynamicChild(
  repository: TopologyRepository,
  topology: TopologyService,
  parentId: string,
  spec: RootEquipmentSpec,
): Promise<EquipmentNode> {
  const current = await repository.getById(parentId);
  const parent = current ? expectKind(current, 'EQUIPMENT', parentId) : null;
  if (!parent) throw new Error(`SEED_01_BASE_REQUIRED: Equipment parent ${parentId}`);
  if (parent.childMode !== 'DYNAMIC') {
    throw new Error(`SEED_01_CONFLICT: parent ${parent.name} is not dynamic`);
  }

  if (spec.serialNumber) {
    const serialMatches = await repository.findActiveBySerialNumber(spec.serialNumber);
    if (serialMatches.length > 1) {
      throw new Error(`SEED_01_CONFLICT: duplicate active serial ${spec.serialNumber}`);
    }
    if (serialMatches.length === 1) {
      const equipment = expectKind(serialMatches[0]!, 'EQUIPMENT', spec.name);
      if (
        equipment.lifecycle !== 'ACTIVE' ||
        equipment.deviceId !== parent.deviceId ||
        equipment.parentEquipmentId !== parent.id ||
        equipment.equipmentType !== spec.equipmentType ||
        normalizedName(equipment.name) !== normalizedName(spec.name)
      ) {
        throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} parent/type mismatch`);
      }
      if (spec.manufacturer && equipment.manufacturer !== spec.manufacturer) {
        throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} manufacturer mismatch`);
      }
      if (spec.model && equipment.model !== spec.model) {
        throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} model mismatch`);
      }
      return equipment;
    }
  }

  const children = (
    await Promise.all(
      parent.children
        .filter((id): id is string => typeof id === 'string')
        .map((id) => repository.getById(id)),
    )
  ).filter(
    (item): item is EquipmentNode =>
      item?.kind === 'EQUIPMENT' &&
      item.lifecycle === 'ACTIVE' &&
      item.parentEquipmentId === parent.id &&
      normalizedName(item.name) === normalizedName(spec.name),
  );
  if (children.length > 1) {
    throw new Error(`SEED_01_CONFLICT: duplicate child Equipment ${spec.name}`);
  }
  if (children.length === 1) {
    const equipment = children[0]!;
    if (equipment.equipmentType !== spec.equipmentType) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} type mismatch`);
    }
    if (spec.serialNumber && equipment.serialNumber !== spec.serialNumber) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} serial mismatch`);
    }
    if (spec.manufacturer && equipment.manufacturer !== spec.manufacturer) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} manufacturer mismatch`);
    }
    if (spec.model && equipment.model !== spec.model) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} model mismatch`);
    }
    if (spec.childMode && equipment.childMode !== spec.childMode) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} child mode mismatch`);
    }
    if (spec.childCapacity !== undefined && equipment.children.length !== spec.childCapacity) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} child capacity mismatch`);
    }
    return equipment;
  }

  const created = await topology.create({
    kind: 'EQUIPMENT',
    parentId: parent.id,
    name: spec.name,
    equipmentType: spec.equipmentType,
    ...(spec.manufacturer ? { manufacturer: spec.manufacturer } : {}),
    ...(spec.model ? { model: spec.model } : {}),
    ...(spec.serialNumber ? { serialNumber: spec.serialNumber } : {}),
    ...(spec.category ? { category: spec.category } : {}),
    ...(spec.aliases?.length ? { aliases: spec.aliases } : {}),
    ...(spec.childMode ? { childMode: spec.childMode } : {}),
    ...(spec.childCapacity ? { childCapacity: spec.childCapacity } : {}),
    ...(spec.presentation ? { presentation: spec.presentation } : {}),
  });
  if (!created.ok || created.value.kind !== 'EQUIPMENT') {
    throw new Error(
      `SEED_01_CREATE_FAILED: Equipment ${spec.name}: ${created.ok ? 'INVALID_KIND' : created.error}`,
    );
  }
  return created.value;
}

async function moveEquipmentToParent(
  repository: TopologyRepository,
  topology: TopologyService,
  equipment: EquipmentNode,
  parent: EquipmentNode | DeviceNode,
  targetSlotIndex?: number,
): Promise<EquipmentNode> {
  const fresh = await repository.getById(equipment.id);
  const current = fresh ? expectKind(fresh, 'EQUIPMENT', equipment.name) : null;
  if (!current) throw new Error(`SEED_01_CONFLICT: Equipment ${equipment.name} disappeared`);

  const desiredParentEquipmentId = parent.kind === 'EQUIPMENT' ? parent.id : null;
  if (
    current.parentId === parent.id &&
    current.parentEquipmentId === desiredParentEquipmentId &&
    (parent.kind === 'DEVICE' || parent.childMode === 'DYNAMIC')
  ) {
    return current;
  }

  const moved = await topology.move(current.id, parent.id, targetSlotIndex);
  if (!moved.ok || moved.value.kind !== 'EQUIPMENT') {
    throw new Error(
      `SEED_01_MIGRATION_FAILED: move ${current.name} under ${parent.name}: ${
        moved.ok ? 'INVALID_KIND' : moved.error
      }`,
    );
  }
  return moved.value;
}

async function findEquipmentByName(
  repository: TopologyRepository,
  device: DeviceNode,
  name: string,
  equipmentType: EquipmentNode['equipmentType'],
): Promise<EquipmentNode | null> {
  const matches = (await repository.listEquipmentForDevice(device.id)).filter(
    (item) =>
      item.lifecycle === 'ACTIVE' &&
      item.equipmentType === equipmentType &&
      normalizedName(item.name) === normalizedName(name),
  );
  if (matches.length > 1) {
    throw new Error(`SEED_01_CONFLICT: duplicate ${equipmentType} ${name} in ${device.name}`);
  }
  return matches[0] ?? null;
}

async function ensureRootEquipmentFromAnywhere(
  repository: TopologyRepository,
  topology: TopologyService,
  device: DeviceNode,
  spec: RootEquipmentSpec,
): Promise<EquipmentNode> {
  let existing: EquipmentNode | null = null;
  if (spec.serialNumber) {
    const matches = await repository.findActiveBySerialNumber(spec.serialNumber);
    if (matches.length > 1) {
      throw new Error(`SEED_01_CONFLICT: duplicate active serial ${spec.serialNumber}`);
    }
    if (matches.length === 1) {
      existing = expectKind(matches[0]!, 'EQUIPMENT', spec.name);
    }
  }
  existing ??= await findEquipmentByName(repository, device, spec.name, spec.equipmentType);

  if (!existing) return ensureRootEquipment(repository, topology, device, spec);
  if (existing.deviceId !== device.id || existing.equipmentType !== spec.equipmentType) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} ownership/type mismatch`);
  }
  if (spec.serialNumber && existing.serialNumber !== spec.serialNumber) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} serial mismatch`);
  }
  if (spec.manufacturer && existing.manufacturer !== spec.manufacturer) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} manufacturer mismatch`);
  }
  if (spec.model && existing.model !== spec.model) {
    throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} model mismatch`);
  }
  return existing.parentEquipmentId === null
    ? existing
    : moveEquipmentToParent(repository, topology, existing, device);
}

async function ensurePresentation(
  repository: TopologyRepository,
  equipment: EquipmentNode,
  presentation: NonNullable<EquipmentNode['presentation']>,
): Promise<EquipmentNode> {
  const freshNode = await repository.getById(equipment.id);
  const fresh = freshNode ? expectKind(freshNode, 'EQUIPMENT', equipment.name) : null;
  if (!fresh) throw new Error(`SEED_01_CONFLICT: Equipment ${equipment.name} disappeared`);

  if (
    fresh.presentation?.direction === presentation.direction &&
    fresh.presentation?.maxPerLine === presentation.maxPerLine &&
    fresh.presentation?.childrenVisibility === presentation.childrenVisibility
  ) {
    return fresh;
  }
  if (!repository.commitLayout) {
    throw new Error('SEED_01_MIGRATION_FAILED: ATOMIC_LAYOUT_STORAGE_REQUIRED');
  }
  const updated: EquipmentNode = {
    ...fresh,
    presentation: { ...presentation },
    updatedAt: new Date().toISOString(),
  };
  if (!(await repository.commitLayout([fresh], [updated]))) {
    throw new Error(`SEED_01_MIGRATION_FAILED: presentation conflict for ${fresh.name}`);
  }
  return updated;
}

async function ensurePanelInFrame(
  repository: TopologyRepository,
  topology: TopologyService,
  device: DeviceNode,
  frame: EquipmentNode,
  panelName: PanelName,
): Promise<EquipmentNode> {
  const slotIndex = panelName.endsWith('3')
    ? 0
    : panelName.endsWith('2')
      ? 1
      : panelName.endsWith('1')
        ? 2
        : -1;
  if (slotIndex < 0) {
    throw new Error(`SEED_01_INTERNAL: invalid panel slot ${panelName}`);
  }

  const existing = await findEquipmentByName(repository, device, panelName, 'PANEL');
  const presentation = {
    direction: 'COLUMN' as const,
    maxPerLine: 1,
    childrenVisibility: 'INLINE' as const,
  };
  if (existing) {
    if (existing.childMode !== 'POSITIONAL' || existing.children.length !== 24) {
      throw new Error(`SEED_01_CONFLICT: PANEL ${panelName} must expose 24 positions`);
    }
    const moved = await moveEquipmentToParent(repository, topology, existing, frame, slotIndex);
    return ensurePresentation(repository, moved, presentation);
  }

  const created = await ensurePositionalChild(repository, topology, frame.id, slotIndex, {
    name: panelName,
    equipmentType: 'PANEL',
    category: '24-position DC distribution panel',
    childCapacity: 24,
    presentation,
  });
  return ensurePresentation(repository, created, presentation);
}

async function ensurePositionalChild(
  repository: TopologyRepository,
  topology: TopologyService,
  parentId: string,
  slotIndex: number,
  spec: Omit<RootEquipmentSpec, 'serialNumber'> & { readonly serialNumber?: string },
): Promise<EquipmentNode> {
  const parent = expectKind(
    exactlyOne(
      [await repository.getById(parentId)].filter((item): item is TopologyNode => Boolean(item)),
      `Equipment parent ${parentId}`,
    ),
    'EQUIPMENT',
    parentId,
  );
  if (parent.childMode !== 'POSITIONAL') {
    throw new Error(`SEED_01_CONFLICT: parent ${parent.name} is not positional`);
  }
  if (slotIndex < 0 || slotIndex >= parent.children.length) {
    throw new Error(`SEED_01_CONFLICT: slot ${slotIndex + 1} outside ${parent.name}`);
  }

  const existingId = parent.children[slotIndex];
  if (existingId) {
    const existing = await repository.getById(existingId);
    const equipment = expectKind(
      exactlyOne(
        [existing].filter((item): item is TopologyNode => Boolean(item)),
        spec.name,
      ),
      'EQUIPMENT',
      spec.name,
    );
    if (
      equipment.lifecycle !== 'ACTIVE' ||
      equipment.parentEquipmentId !== parent.id ||
      equipment.deviceId !== parent.deviceId ||
      equipment.equipmentType !== spec.equipmentType ||
      normalizedName(equipment.name) !== normalizedName(spec.name)
    ) {
      throw new Error(
        `SEED_01_CONFLICT: ${parent.name} slot ${slotIndex + 1} is already occupied by incompatible Equipment`,
      );
    }
    if (spec.childCapacity !== undefined) {
      if (
        equipment.childMode !== 'POSITIONAL' ||
        equipment.children.length !== spec.childCapacity
      ) {
        throw new Error(`SEED_01_CONFLICT: ${spec.name} positional capacity mismatch`);
      }
    }
    return equipment;
  }

  const created = await topology.create({
    kind: 'EQUIPMENT',
    parentId: parent.id,
    parentSlotIndex: slotIndex,
    name: spec.name,
    equipmentType: spec.equipmentType,
    ...(spec.manufacturer ? { manufacturer: spec.manufacturer } : {}),
    ...(spec.model ? { model: spec.model } : {}),
    ...(spec.serialNumber ? { serialNumber: spec.serialNumber } : {}),
    ...(spec.category ? { category: spec.category } : {}),
    ...(spec.aliases?.length ? { aliases: spec.aliases } : {}),
    ...(spec.childCapacity
      ? { childMode: 'POSITIONAL' as const, childCapacity: spec.childCapacity }
      : {}),
    ...(spec.presentation ? { presentation: spec.presentation } : {}),
  });
  if (!created.ok || created.value.kind !== 'EQUIPMENT') {
    throw new Error(
      `SEED_01_CREATE_FAILED: Equipment ${spec.name}: ${created.ok ? 'INVALID_KIND' : created.error}`,
    );
  }
  return created.value;
}

async function ensureFullRackOccupancy(
  repository: TopologyRepository,
  rackId: string,
  chassisId: string,
): Promise<void> {
  const rackNode = await repository.getById(rackId);
  const chassisNode = await repository.getById(chassisId);
  const rack = rackNode ? expectKind(rackNode, 'CONTAINER_RACK', rackId) : null;
  const chassis = chassisNode ? expectKind(chassisNode, 'EQUIPMENT', chassisId) : null;
  if (!rack || rack.variant !== 'RACK' || !rack.totalU) {
    throw new Error(`SEED_01_CONFLICT: rack ${rackId} has no U capacity`);
  }
  if (!chassis) throw new Error(`SEED_01_CONFLICT: chassis ${chassisId} missing`);

  if (chassis.rackPlacement) {
    if (
      chassis.rackPlacement.rackId === rack.id &&
      chassis.rackPlacement.startU === 1 &&
      chassis.rackPlacement.sizeU === rack.totalU
    ) {
      return;
    }
    throw new Error(`SEED_01_CONFLICT: chassis ${chassis.name} already has another rack placement`);
  }

  const equipped = rack.cas.find(
    (range) => range.state === 'EQUIPPED' && range.occupantId === chassis.id,
  );
  if (equipped) return;
  if (rack.cas.some((range) => range.state !== 'AVAILABLE')) {
    throw new Error(`SEED_01_CONFLICT: rack ${rack.name} is not empty`);
  }

  const cas = new CasService(repository);
  const reserved = await cas.reserve(rack.id, {
    mountStartU: 1,
    physicalSizeU: rack.totalU,
  });
  if (!reserved.ok) {
    throw new Error(`SEED_01_CREATE_FAILED: reserve ${rack.name}: ${reserved.error}`);
  }
  const allocation = reserved.value.cas.find(
    (range) =>
      range.state === 'RESERVED' && range.mountStartU === 1 && range.physicalSizeU === rack.totalU,
  );
  if (!allocation) {
    throw new Error(`SEED_01_CREATE_FAILED: reservation missing for ${rack.name}`);
  }
  const equippedResult = await cas.equip(rack.id, allocation.id, chassis.id);
  if (!equippedResult.ok) {
    throw new Error(`SEED_01_CREATE_FAILED: equip ${rack.name}: ${equippedResult.error}`);
  }
}

async function seedBdfb(
  repository: TopologyRepository,
  topology: TopologyService,
  rack: ContainerRackNode,
  spec: BdfbSpec,
): Promise<{
  readonly deviceId: string;
  readonly breakerCount: number;
  readonly gatewayEquipmentId: string;
  readonly gatewaySerial: string;
  readonly controllerEquipmentId: string;
  readonly panelIds: Readonly<Record<PanelName, string>>;
  readonly breakerEquipmentIds: Readonly<Record<string, string>>;
  readonly meterEquipmentIds: Readonly<Record<MeterPanelName, string>>;
}> {
  const device = await ensureBdfbDevice(repository, topology, rack, spec);

  // v1 used a DYNAMIC chassis with panels/instrumentation directly beneath it.
  // v3 migrates that same chassis in place to the established canonical chain:
  // CHASSIS[1] -> SHELF[2 frames] -> FRAME[3 panel slots] -> PANEL[24] -> CB.
  let chassis = await findEquipmentByName(repository, device, `${spec.key} Chassis`, 'CHASSIS');
  if (!chassis) {
    chassis = await ensureRootEquipment(repository, topology, device, {
      name: `${spec.key} Chassis`,
      equipmentType: 'CHASSIS',
      manufacturer: 'Eltek',
      model: 'BDCBB/BDFB Power Distribution Solution',
      category: '48 VDC BDFB chassis · 144 physical breaker positions (6 x 24)',
      childMode: 'POSITIONAL',
      childCapacity: 1,
    });
  }
  await ensureFullRackOccupancy(repository, rack.id, chassis.id);

  // Move non-distribution instrumentation out of the chassis so its single
  // physical child remains the BDFB shelf.
  const controller = await ensureRootEquipmentFromAnywhere(repository, topology, device, {
    name: `${spec.key}_CTRL-1`,
    equipmentType: 'CONTROLLER_BOARD',
    manufacturer: 'Eltek',
    model: 'SmartPack2 Touch',
    category: 'Integrated BDFB controller · physical serial pending QDF assignment',
    aliases: ['SmartPack2 Touch', 'SNMP'],
  });
  const gateway = await ensureRootEquipmentFromAnywhere(repository, topology, device, {
    name: `${spec.key}_GW-1`,
    equipmentType: 'NETWORK_BOARD',
    manufacturer: 'Acrel',
    model: 'AWT100-CEHW',
    serialNumber: spec.gatewaySerial,
    category:
      'Industrial gateway · RS485 master · network commissioning pending field verification',
    aliases: ['AWT100-CEHW', 'Modbus RTU master', 'MQTT/Modbus TCP gateway'],
  });
  const meterEquipmentIds = {} as Record<MeterPanelName, string>;
  const breakerEquipmentIds: Record<string, string> = {};
  for (const meter of spec.meters) {
    const equipment = await ensureRootEquipmentFromAnywhere(repository, topology, device, {
      name: `${spec.key}_METER-${meter.panel}`,
      equipmentType: 'CUSTOM',
      manufacturer: 'Acrel',
      model: 'AMC16Z-FDK24',
      serialNumber: meter.serial,
      category: `DC multi-circuit meter · ${meter.panel} · 24 channels`,
      aliases: [meter.panel, `RS485 slave ${meter.slaveId}`, 'AHKC-EKA 0-150 A / 5 V'],
    });
    meterEquipmentIds[meter.panel] = equipment.id;
  }

  // Existing v1 chassis is DYNAMIC. Create the shelf while still compatible,
  // migrate panels, then freeze the chassis to one positional shelf slot.
  const freshChassisBeforeShelf = expectKind(
    (await repository.getById(chassis.id))!,
    'EQUIPMENT',
    chassis.name,
  );
  let shelf = await findEquipmentByName(repository, device, `${spec.key}-SHELF-01`, 'SHELF');
  if (!shelf) {
    shelf =
      freshChassisBeforeShelf.childMode === 'POSITIONAL'
        ? await ensurePositionalChild(repository, topology, freshChassisBeforeShelf.id, 0, {
            name: `${spec.key}-SHELF-01`,
            equipmentType: 'SHELF',
            category: 'BDFB distribution shelf',
            childCapacity: 2,
            presentation: {
              direction: 'ROW',
              maxPerLine: 2,
              childrenVisibility: 'INLINE',
            },
          })
        : await ensureDynamicChild(repository, topology, freshChassisBeforeShelf.id, {
            name: `${spec.key}-SHELF-01`,
            equipmentType: 'SHELF',
            category: 'BDFB distribution shelf',
            childMode: 'POSITIONAL',
            childCapacity: 2,
            presentation: {
              direction: 'ROW',
              maxPerLine: 2,
              childrenVisibility: 'INLINE',
            },
          });
  } else {
    shelf = await moveEquipmentToParent(
      repository,
      topology,
      shelf,
      freshChassisBeforeShelf,
      freshChassisBeforeShelf.childMode === 'POSITIONAL' ? 0 : undefined,
    );
  }
  if (shelf.childMode !== 'POSITIONAL' || shelf.children.length !== 2) {
    throw new Error(`SEED_01_CONFLICT: ${shelf.name} must contain exactly 2 frame slots`);
  }
  shelf = await ensurePresentation(repository, shelf, {
    direction: 'ROW',
    maxPerLine: 2,
    childrenVisibility: 'INLINE',
  });

  let frameA = await ensurePositionalChild(repository, topology, shelf.id, 0, {
    name: `${spec.key}-SHELF-01-FRAME-01`,
    equipmentType: 'FRAME',
    category: 'Side A breaker frame',
    childCapacity: 3,
    presentation: {
      direction: 'COLUMN',
      maxPerLine: 1,
      childrenVisibility: 'INLINE',
    },
  });
  let frameB = await ensurePositionalChild(repository, topology, shelf.id, 1, {
    name: `${spec.key}-SHELF-01-FRAME-02`,
    equipmentType: 'FRAME',
    category: 'Side B breaker frame',
    childCapacity: 3,
    presentation: {
      direction: 'COLUMN',
      maxPerLine: 1,
      childrenVisibility: 'INLINE',
    },
  });
  frameA = await ensurePresentation(repository, frameA, {
    direction: 'COLUMN',
    maxPerLine: 1,
    childrenVisibility: 'INLINE',
  });
  frameB = await ensurePresentation(repository, frameB, {
    direction: 'COLUMN',
    maxPerLine: 1,
    childrenVisibility: 'INLINE',
  });

  const panels = new Map<PanelName, EquipmentNode>();
  for (const panelName of PANELS) {
    const frame = panelName.startsWith('A') ? frameA : frameB;
    panels.set(panelName, await ensurePanelInFrame(repository, topology, device, frame, panelName));
  }

  // After all legacy direct children have been migrated, freeze the chassis as
  // POSITIONAL capacity 1 with the shelf in slot 1.
  const freshChassis = expectKind(
    (await repository.getById(chassis.id))!,
    'EQUIPMENT',
    chassis.name,
  );
  const unexpectedChildren = freshChassis.children.filter(
    (childId): childId is string => Boolean(childId) && childId !== shelf.id,
  );
  if (unexpectedChildren.length) {
    throw new Error(
      `SEED_01_CONFLICT: ${freshChassis.name} has unexpected direct children after migration`,
    );
  }
  if (
    freshChassis.childMode !== 'POSITIONAL' ||
    freshChassis.children.length !== 1 ||
    freshChassis.children[0] !== shelf.id
  ) {
    const canonicalChassis: EquipmentNode = {
      ...freshChassis,
      childMode: 'POSITIONAL',
      children: [shelf.id],
      updatedAt: new Date().toISOString(),
    };
    if (!repository.commitLayout) {
      throw new Error('SEED_01_MIGRATION_FAILED: ATOMIC_LAYOUT_STORAGE_REQUIRED');
    }
    if (!(await repository.commitLayout([freshChassis], [canonicalChassis]))) {
      throw new Error('SEED_01_MIGRATION_FAILED: CHASSIS_LAYOUT_CONFLICT');
    }
  }

  for (const breaker of spec.breakers) {
    const panel = panels.get(breaker.panel);
    if (!panel) throw new Error(`SEED_01_INTERNAL: missing panel ${breaker.panel}`);
    const breakerEquipment = await ensurePositionalChild(
      repository,
      topology,
      panel.id,
      breaker.position - 1,
      {
        name: `${breaker.panel}-${String(breaker.position).padStart(2, '0')}`,
        equipmentType: 'CIRCUIT_BREAKER',
        category: '48 VDC feeder',
        aliases: [breaker.destination],
      },
    );
    breakerEquipmentIds[`${breaker.panel}:${breaker.position}`] = breakerEquipment.id;
  }

  return {
    deviceId: device.id,
    breakerCount: spec.breakers.length,
    gatewayEquipmentId: gateway.id,
    gatewaySerial: spec.gatewaySerial,
    controllerEquipmentId: controller.id,
    panelIds: Object.fromEntries(
      [...panels.entries()].map(([name, panel]) => [name, panel.id]),
    ) as Record<PanelName, string>,
    breakerEquipmentIds,
    meterEquipmentIds,
  };
}

const SEED_01_EVIDENCE = {
  projectId: 'TELXIUS-LURIN-BDFB-ACREL',
  documentName: 'CP_Acrel_v0.2',
  revision: 'v0.2',
  projectName: 'Telxius Lurin BDFB circuit telemetry',
  site: 'Lurín',
  client: 'TELXIUS CABLE PERU S.A.C.',
  documentStatus: 'DECLARED_SOURCE',
} as const;

function sameRs485(
  left: CommunicationProfile['rs485'],
  right: CommunicationProfile['rs485'],
): boolean {
  return (
    left.baudRate === right.baudRate &&
    left.dataBits === right.dataBits &&
    left.parity === right.parity &&
    left.stopBits === right.stopBits &&
    left.slaveId === right.slaveId
  );
}

async function ensureIndustrialProfile(
  database: Db,
  session: ClientSession,
  desired: CommunicationProfile,
): Promise<void> {
  const profiles = database.collection<CommunicationProfile & Document>(
    'industrial_communication_profiles',
  );
  const existing = await profiles.findOne({ equipmentId: desired.equipmentId }, { session });

  if (existing) {
    if (
      existing.bdfbDeviceId !== desired.bdfbDeviceId ||
      existing.role !== desired.role ||
      !sameRs485(existing.rs485, desired.rs485) ||
      (desired.role === 'METER' && existing.gatewayEquipmentId !== desired.gatewayEquipmentId)
    ) {
      throw new Error(
        `SEED_01_CONFLICT: industrial profile ${desired.equipmentId} differs from seed-01 commissioning truth`,
      );
    }
    // Existing operator commissioning wins for network/source identity/status.
    // Seed migration never overwrites later field work.
    return;
  }

  await profiles.insertOne(desired, { session });
}

async function seedIndustrialProfiles(
  database: Db,
  session: ClientSession,
  spec: BdfbSpec,
  created: {
    readonly deviceId: string;
    readonly gatewayEquipmentId: string;
    readonly meterEquipmentIds: Readonly<Record<MeterPanelName, string>>;
  },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const actor = 'seed:seed-01:v5';

  await ensureIndustrialProfile(database, session, {
    equipmentId: created.gatewayEquipmentId,
    role: 'GATEWAY',
    recordStatus: 'DECLARED',
    gatewayNumber: 'GW-1',
    downlinkMode: 'Modbus RTU Master',
    declaredSlaveCount: 4,
    rs485: {
      baudRate: 9600,
      dataBits: 8,
      parity: 'NONE',
      stopBits: 1,
    },
    evidence: { ...SEED_01_EVIDENCE },
    bdfbDeviceId: created.deviceId,
    revisionNumber: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: actor,
    history: [],
  });

  for (const meter of spec.meters) {
    const meterEquipmentId = created.meterEquipmentIds[meter.panel];
    if (!meterEquipmentId) {
      throw new Error(`SEED_01_INTERNAL: missing meter Equipment for ${spec.key} ${meter.panel}`);
    }
    await ensureIndustrialProfile(database, session, {
      equipmentId: meterEquipmentId,
      role: 'METER',
      recordStatus: 'DECLARED',
      gatewayEquipmentId: created.gatewayEquipmentId,
      meterNumber: meter.panel,
      channelCount: 24,
      channelDescription: `24 DC circuit channels for panel ${meter.panel}`,
      hallSensorDescription: 'AHKC-EKA (0–150 A / 5 V)',
      rs485: {
        baudRate: 9600,
        dataBits: 8,
        parity: 'NONE',
        stopBits: 1,
        slaveId: meter.slaveId,
      },
      evidence: { ...SEED_01_EVIDENCE },
      bdfbDeviceId: created.deviceId,
      revisionNumber: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: actor,
      history: [],
    });
  }
}

const INTEGRATION_PROFILE = 'seed-01-controlled' as const;
const INTEGRATION_SNMP_SOURCE = {
  'QDF-2': 'INT-SNMP-QDF-2',
  'QDF-4': 'INT-SNMP-QDF-4',
  'QDF-5': 'INT-SNMP-QDF-5',
} as const;
const INTEGRATION_FEEDS = [
  { slot: 'A1', panel: 'A3', side: 'A', index: 1 },
  { slot: 'A2', panel: 'A2', side: 'A', index: 2 },
  { slot: 'B1', panel: 'B3', side: 'B', index: 3 },
  { slot: 'B2', panel: 'B2', side: 'B', index: 4 },
] as const;
const MQTT_PANEL_GROUP: Readonly<Record<'A3' | 'A2' | 'B3' | 'B2', number>> = {
  A3: 1,
  A2: 2,
  B3: 3,
  B2: 4,
};

async function ensureControlledIntegration(
  database: Db,
  session: ClientSession,
  spec: BdfbSpec,
  created: {
    readonly deviceId: string;
    readonly gatewaySerial: string;
    readonly gatewayEquipmentId: string;
    readonly controllerEquipmentId: string;
    readonly panelIds: Readonly<Record<PanelName, string>>;
    readonly breakerEquipmentIds: Readonly<Record<string, string>>;
  },
): Promise<void> {
  if (process.env.SITE_MAPPER_INTEGRATION_PROFILE?.trim() !== INTEGRATION_PROFILE) return;

  const topologyNodes = database.collection<TopologyNode & Document>('topology_nodes');
  const device = await topologyNodes.findOne({ id: created.deviceId, kind: 'DEVICE' }, { session });
  if (!device || device.kind !== 'DEVICE') {
    throw new Error(`SEED_01_INTEGRATION_CONFLICT: missing BDFB ${spec.key}`);
  }
  const chassis = await topologyNodes.findOne(
    {
      kind: 'EQUIPMENT',
      deviceId: created.deviceId,
      equipmentType: 'CHASSIS',
      lifecycle: 'ACTIVE',
    },
    { session },
  );
  if (!chassis || chassis.kind !== 'EQUIPMENT') {
    throw new Error(`SEED_01_INTEGRATION_CONFLICT: missing chassis ${spec.key}`);
  }

  const desiredPorts = INTEGRATION_FEEDS.map((feed) => ({
    id: `integration:seed01:${spec.key}:feed:${feed.slot}`,
    deviceId: created.deviceId,
    equipmentId: chassis.id,
    name: `CONTROLLED ${feed.slot}`,
    portType: 'POWER' as const,
    direction: 'INPUT' as const,
    exposure: 'EXTERNAL' as const,
    protocol: 'SNMPv2c',
    attributes: {
      snmpFeedInput: true,
      feed: feed.side,
      feedPosition: feed.slot,
      ratedCurrentA: 800,
      shuntRatedCurrentA: 1000,
      shuntRatedMillivolts: 60,
      overloadThresholdA: 640,
      servedPanelIds: [created.panelIds[feed.panel]],
      independentInputConfirmed: false,
      commissioning: 'SYNTHETIC_LAB_ONLY',
      integrationProfile: INTEGRATION_PROFILE,
      synthetic: true,
    },
    lifecycle: 'ACTIVE' as const,
  }));

  const foreignPorts = chassis.accessPorts.filter(
    (port) => port.attributes?.integrationProfile !== INTEGRATION_PROFILE,
  );
  const existingControlled = chassis.accessPorts.filter(
    (port) => port.attributes?.integrationProfile === INTEGRATION_PROFILE,
  );
  if (
    existingControlled.length &&
    JSON.stringify(existingControlled) !== JSON.stringify(desiredPorts)
  ) {
    throw new Error(`SEED_01_INTEGRATION_CONFLICT: SNMP feed inventory differs for ${spec.key}`);
  }
  if (!existingControlled.length) {
    await topologyNodes.updateOne(
      { id: chassis.id, lifecycle: 'ACTIVE' },
      {
        $set: {
          accessPorts: [...foreignPorts, ...desiredPorts],
          updatedAt: new Date().toISOString(),
        },
      },
      { session },
    );
  }

  const bindings = database.collection<TelemetryBinding & Document>('telemetry_bindings');
  const now = new Date().toISOString();
  const desired: TelemetryBinding[] = [];

  desired.push({
    id: `integration:seed01:mqtt:${created.gatewaySerial}:source`,
    protocol: 'MQTT',
    sourceIdentity: created.gatewaySerial,
    metric: 'SOURCE',
    targetType: 'EQUIPMENT',
    targetId: created.gatewayEquipmentId,
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    attributes: {
      commissioning: 'CONTROLLED_INTEGRATION',
      integrationProfile: INTEGRATION_PROFILE,
      transportEquipmentId: created.gatewayEquipmentId,
    },
  });

  for (const breaker of spec.breakers) {
    const targetId = created.breakerEquipmentIds[`${breaker.panel}:${breaker.position}`];
    const group = MQTT_PANEL_GROUP[breaker.panel as keyof typeof MQTT_PANEL_GROUP];
    if (!targetId || !group) continue;
    const sourcePointId = `0_${group}_${breaker.position}`;
    for (const [metric, unit] of [
      ['VOLTAGE', 'V'],
      ['CURRENT', 'A'],
      ['POWER', 'W'],
      ['ENERGY', 'kWh'],
    ] as const) {
      desired.push({
        id: `integration:seed01:mqtt:${created.gatewaySerial}:${sourcePointId}:${metric.toLowerCase()}`,
        protocol: 'MQTT',
        sourceIdentity: created.gatewaySerial,
        sourcePointId,
        metric,
        unit,
        targetType: 'EQUIPMENT',
        targetId,
        lifecycle: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        attributes: {
          commissioning: 'CONTROLLED_INTEGRATION',
          integrationProfile: INTEGRATION_PROFILE,
          synthetic: true,
          qdf: spec.key,
          panelLabel: breaker.panel,
          position: breaker.position,
        },
      });
    }
  }

  const snmpSource = INTEGRATION_SNMP_SOURCE[spec.key];
  for (const feed of INTEGRATION_FEEDS) {
    const portId = `integration:seed01:${spec.key}:feed:${feed.slot}`;
    for (const point of [
      {
        metric: 'CURRENT',
        unit: 'A',
        oid: `1.3.6.1.4.1.8072.9999.2026.49.1.${feed.index}.0`,
      },
      {
        metric: 'VOLTAGE',
        unit: 'V',
        oid: `1.3.6.1.4.1.8072.9999.2026.49.2.${feed.index}.0`,
      },
    ] as const) {
      desired.push({
        id: `integration:seed01:snmp:${spec.key}:${feed.slot}:${point.metric.toLowerCase()}`,
        protocol: 'SNMP',
        sourceIdentity: snmpSource,
        sourcePointId: point.oid,
        metric: point.metric,
        unit: point.unit,
        targetType: 'ACCESS_PORT',
        targetId: portId,
        lifecycle: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        attributes: {
          commissioning: 'SYNTHETIC_LAB_ONLY',
          integrationProfile: INTEGRATION_PROFILE,
          synthetic: true,
          qdf: spec.key,
          feedPosition: feed.slot,
        },
      });
    }
  }

  for (const binding of desired) {
    const existing = await bindings.findOne({ id: binding.id }, { session });
    if (existing) {
      if (
        existing.protocol !== binding.protocol ||
        existing.sourceIdentity !== binding.sourceIdentity ||
        existing.sourcePointId !== binding.sourcePointId ||
        existing.metric !== binding.metric ||
        existing.targetType !== binding.targetType ||
        existing.targetId !== binding.targetId
      ) {
        throw new Error(`SEED_01_INTEGRATION_CONFLICT: binding ${binding.id}`);
      }
      continue;
    }
    const sourceConflict = await bindings.findOne(
      {
        lifecycle: 'ACTIVE',
        protocol: binding.protocol,
        sourceIdentity: binding.sourceIdentity,
        sourcePointId:
          binding.sourcePointId === undefined ? { $exists: false } : binding.sourcePointId,
        metric: binding.metric,
      },
      { session },
    );
    if (sourceConflict) {
      throw new Error(`SEED_01_INTEGRATION_CONFLICT: source already bound ${binding.id}`);
    }
    await bindings.insertOne({ ...binding, revision: 1 }, { session });
  }

  if (device.attributes?.bdfbHardwareProfile !== 'ELTEK_BDCBB_CONFIG_4') {
    await topologyNodes.updateOne(
      { id: created.deviceId, kind: 'DEVICE', lifecycle: 'ACTIVE' },
      {
        $set: {
          attributes: {
            ...(device.attributes ?? {}),
            bdfbHardwareProfile: 'ELTEK_BDCBB_CONFIG_4',
            integrationProfile: INTEGRATION_PROFILE,
          },
          updatedAt: new Date().toISOString(),
        },
      },
      { session },
    );
  }
}

export async function applySeed01(database: Db): Promise<Seed01Summary> {
  return withIntegrityTransaction(database, async (session) => {
    const state = database.collection<Seed01StateDocument>('runtime_seed_state');
    const previous = await state.findOne({ _id: SEED_01_PROFILE }, { session });

    if (typeof previous?.version === 'number' && previous.version > SEED_01_VERSION) {
      throw new Error(
        `SEED_01_VERSION_UNSUPPORTED: database has ${previous.version}, image supports ${SEED_01_VERSION}`,
      );
    }
    if (previous?.status === 'APPLIED' && previous.version === SEED_01_VERSION) {
      return {
        profile: SEED_01_PROFILE,
        version: SEED_01_VERSION,
        alreadyApplied: true,
        roomId: String(previous.roomId ?? ''),
        bdfbs: Array.isArray(previous.bdfbs) ? previous.bdfbs : [],
      };
    }

    const repository = new MongoTopologyRepository(database);
    const topology = new TopologyService(repository);
    const base = await ensureBase(repository, topology);
    const bdfbs: Seed01Summary['bdfbs'][number][] = [];

    for (const spec of BDFBS) {
      const rack = base.racks.get(spec.key);
      if (!rack) throw new Error(`SEED_01_BASE_REQUIRED: rack for ${spec.key}`);
      const created = await seedBdfb(repository, topology, rack, spec);
      await seedIndustrialProfiles(database, session, spec, created);
      await ensureControlledIntegration(database, session, spec, created);
      bdfbs.push({
        key: spec.key,
        rackId: rack.id,
        deviceId: created.deviceId,
        breakerCount: created.breakerCount,
      });
    }

    const appliedAt = new Date().toISOString();
    await state.replaceOne(
      { _id: SEED_01_PROFILE },
      {
        _id: SEED_01_PROFILE,
        profile: SEED_01_PROFILE,
        version: SEED_01_VERSION,
        status: 'APPLIED',
        appliedAt,
        roomId: base.room.id,
        bdfbs,
        source: {
          topology: 'seed-01 canonical runtime seed manifest',
          commissioning: 'CP_Acrel_v0.2',
          breakerSchedule: 'Lista de Equipos QDF mop 1 - actualizado',
          snmp: 'Results SNMPWalk',
        },
        observations: {
          unassignedSmartPack2: {
            company: 'TELXIUS CABLE PERU S.A.C.',
            site: 'ESTACION LURIN',
            model: 'SmartPack2 Touch',
            serialNumber: '261243000151',
            nominalVoltageVdc: 48,
            assignmentStatus: 'UNASSIGNED_TO_QDF',
          },
          qdf2BreakerMigration: 'FINAL_POSITIONS_NOT_DECLARED',
          industrialNetworkIdentity: 'NETWORK_PENDING',
          acrelChannelMappings: 'PHYSICAL_CONFIRMATION_REQUIRED',
        },
        counts: {
          bdfbs: 3,
          panels: 18,
          physicalBreakerSlots: 432,
          meteredChannelCapacity: 288,
          gateways: 3,
          meters: 12,
          industrialProfiles: 15,
          confirmedChannelMappings: 0,
          controllers: 3,
          confirmedBreakers: 48,
        },
      },
      { upsert: true, session },
    );

    return {
      profile: SEED_01_PROFILE,
      version: SEED_01_VERSION,
      alreadyApplied: false,
      roomId: base.room.id,
      bdfbs,
    };
  });
}
