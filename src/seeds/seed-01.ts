import type { Db } from 'mongodb';

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

export const SEED_01_PROFILE = 'seed-01' as const;
export const SEED_01_VERSION = 1 as const;

const PANELS = ['A3', 'A2', 'B3', 'B2'] as const;
type PanelName = (typeof PANELS)[number];

interface MeterSpec {
  readonly panel: PanelName;
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
  site: 'TELXIUS LURIN CABLE LANDING STATION',
  structure: 'EDIFICIO PRINCIPAL',
  level: 'LEVEL 00',
  room: 'SALA DE TRANSMISIONES',
} as const;

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

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
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
      node.lifecycle === 'ACTIVE' &&
      node.kind === kind &&
      normalizedName(node.name) === expected,
  );
  return expectKind(exactlyOne(children, `${kind} ${name}`), kind, name);
}

async function resolveBase(
  repository: TopologyRepository,
  topology: TopologyService,
): Promise<{
  readonly room: Extract<TopologyNode, { kind: 'ROOM_SUBSTRUCTURE' }>;
  readonly racks: ReadonlyMap<BdfbSpec['key'], ContainerRackNode>;
}> {
  const sites = (await repository.listByKind('SITE')).filter(
    (node) =>
      node.lifecycle === 'ACTIVE' &&
      normalizedName(node.name) === normalizedName(BASE.site),
  );
  const site = expectKind(exactlyOne(sites, `SITE ${BASE.site}`), 'SITE', BASE.site);
  const structure = await resolveNamedChild(repository, site.id, 'STRUCTURE', BASE.structure);
  const level = await resolveNamedChild(repository, structure.id, 'LEVEL', BASE.level);
  const room = await resolveNamedChild(repository, level.id, 'ROOM_SUBSTRUCTURE', BASE.room);

  const allRacks = (await repository.listByKind('CONTAINER_RACK')).filter(
    (node): node is ContainerRackNode => node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE',
  );
  const racks = new Map<BdfbSpec['key'], ContainerRackNode>();

  for (const spec of BDFBS) {
    const aliases = new Set(spec.rackNames.map(normalizedName));
    const candidates: ContainerRackNode[] = [];
    for (const rack of allRacks) {
      if (!aliases.has(normalizedName(rack.name))) continue;
      const trail = await topology.getTrail(rack.id);
      if (trail.some((node) => node.id === room.id)) candidates.push(rack);
    }
    racks.set(spec.key, exactlyOne(candidates, `rack for ${spec.key} inside ${BASE.room}`));
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
  readonly childCapacity?: number;
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
  if (spec.childCapacity !== undefined) {
    if (
      equipment.childMode !== 'POSITIONAL' ||
      equipment.children.length !== spec.childCapacity
    ) {
      throw new Error(`SEED_01_CONFLICT: Equipment ${spec.name} positional capacity mismatch`);
    }
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
    ...(spec.childCapacity
      ? { childMode: 'POSITIONAL' as const, childCapacity: spec.childCapacity }
      : {}),
  });
  if (!created.ok || created.value.kind !== 'EQUIPMENT') {
    throw new Error(
      `SEED_01_CREATE_FAILED: Equipment ${spec.name}: ${created.ok ? 'INVALID_KIND' : created.error}`,
    );
  }
  return created.value;
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
      [(await repository.getById(parentId))].filter((item): item is TopologyNode => Boolean(item)),
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
      exactlyOne([existing].filter((item): item is TopologyNode => Boolean(item)), spec.name),
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
  });
  if (!created.ok || created.value.kind !== 'EQUIPMENT') {
    throw new Error(
      `SEED_01_CREATE_FAILED: Equipment ${spec.name}: ${created.ok ? 'INVALID_KIND' : created.error}`,
    );
  }
  return created.value;
}

async function seedBdfb(
  repository: TopologyRepository,
  topology: TopologyService,
  rack: ContainerRackNode,
  spec: BdfbSpec,
): Promise<{ readonly deviceId: string; readonly breakerCount: number }> {
  const device = await ensureBdfbDevice(repository, topology, rack, spec);

  const chassis = await ensureRootEquipment(repository, topology, device, {
    name: `${spec.key} Chassis`,
    equipmentType: 'CHASSIS',
    manufacturer: 'Eltek',
    model: 'BDCBB/BDFB Power Distribution Solution',
    category: '48 VDC BDFB chassis · 96 positions',
    childCapacity: PANELS.length,
  });

  const panels = new Map<PanelName, EquipmentNode>();
  for (const [panelIndex, panelName] of PANELS.entries()) {
    const panel = await ensurePositionalChild(repository, topology, chassis.id, panelIndex, {
      name: panelName,
      equipmentType: 'PANEL',
      category: '24-position DC distribution panel',
      childCapacity: 24,
    });
    panels.set(panelName, panel);
  }

  await ensureRootEquipment(repository, topology, device, {
    name: `${spec.key}_CTRL-1`,
    equipmentType: 'CONTROLLER_BOARD',
    manufacturer: 'Eltek',
    model: 'SmartPack2 Touch',
    category: 'Integrated BDFB controller · physical serial pending QDF assignment',
    aliases: ['SmartPack2 Touch', 'SNMP'],
  });

  await ensureRootEquipment(repository, topology, device, {
    name: `${spec.key}_GW-1`,
    equipmentType: 'NETWORK_BOARD',
    manufacturer: 'Acrel',
    model: 'AWT100-CEHW',
    serialNumber: spec.gatewaySerial,
    category: 'Industrial gateway · RS485 master · network commissioning pending field verification',
    aliases: ['AWT100-CEHW', 'Modbus RTU master', 'MQTT/Modbus TCP gateway'],
  });

  for (const meter of spec.meters) {
    await ensureRootEquipment(repository, topology, device, {
      name: `${spec.key}_METER-${meter.panel}`,
      equipmentType: 'CUSTOM',
      manufacturer: 'Acrel',
      model: 'AMC16Z-FDK24',
      serialNumber: meter.serial,
      category: `DC multi-circuit meter · ${meter.panel} · 24 channels`,
      aliases: [
        meter.panel,
        `RS485 slave ${meter.slaveId}`,
        'AHKC-EKA 0-150 A / 5 V',
      ],
    });
  }

  for (const breaker of spec.breakers) {
    const panel = panels.get(breaker.panel);
    if (!panel) throw new Error(`SEED_01_INTERNAL: missing panel ${breaker.panel}`);
    await ensurePositionalChild(repository, topology, panel.id, breaker.position - 1, {
      name: `${breaker.panel}-${String(breaker.position).padStart(2, '0')}`,
      equipmentType: 'CIRCUIT_BREAKER',
      category: '48 VDC feeder',
      aliases: [breaker.destination],
    });
  }

  return { deviceId: device.id, breakerCount: spec.breakers.length };
}

export async function applySeed01(database: Db): Promise<Seed01Summary> {
  const state = database.collection('runtime_seed_state');
  const previous = await state.findOne({ _id: SEED_01_PROFILE });

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
      bdfbs: Array.isArray(previous.bdfbs)
        ? (previous.bdfbs as Seed01Summary['bdfbs'])
        : [],
    };
  }

  const repository = new MongoTopologyRepository(database);
  const topology = new TopologyService(repository);
  const base = await resolveBase(repository, topology);
  const bdfbs: Seed01Summary['bdfbs'][number][] = [];

  for (const spec of BDFBS) {
    const rack = base.racks.get(spec.key);
    if (!rack) throw new Error(`SEED_01_BASE_REQUIRED: rack for ${spec.key}`);
    const created = await seedBdfb(repository, topology, rack, spec);
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
        topology: 'seed-01 Mongo snapshot supplied by operator',
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
        industrialNetworkIdentity: 'FIELD_VERIFICATION_REQUIRED',
      },
      counts: {
        bdfbs: 3,
        panels: 12,
        gateways: 3,
        meters: 12,
        controllers: 3,
        confirmedBreakers: 48,
      },
    },
    { upsert: true },
  );

  return {
    profile: SEED_01_PROFILE,
    version: SEED_01_VERSION,
    alreadyApplied: false,
    roomId: base.room.id,
    bdfbs,
  };
}
