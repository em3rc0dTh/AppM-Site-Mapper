import { PowerContractService } from '@/modules/inventory/application/power-contract-service';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import type { PowerRepository } from '@/modules/power/application/power-repository';
import { PowerService } from '@/modules/power/application/power-service';
import type { BdfbStructureSpec } from '@/modules/power/domain/bdfb-model';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import {
  TopologyService,
  type CreateTopologyNodeInput,
} from '@/modules/topology/application/topology-service';
import type { TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

export const EMULATOR_SERIALS = ['EMU-BFDB-01', 'EMU-BFDB-02', 'EMU-BFDB-03'] as const;

const PANELS = ['A1', 'A2', 'B1', 'B2'] as const;
const POSITIONS_PER_PANEL = 24;
const polygon = (width: number, height: number) => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

async function ensureNode(
  repository: TopologyRepository,
  service: TopologyService,
  input: CreateTopologyNodeInput,
): Promise<TopologyNode> {
  const siblings = input.parentId
    ? await repository.listChildren(input.parentId)
    : await repository.listByKind('NETWORK');
  const existing = siblings.find(
    (node) => node.lifecycle === 'ACTIVE' && node.kind === input.kind && node.name === input.name,
  );
  if (existing) return existing;

  const result = await service.create(input);
  if (!result.ok) throw new Error(`Cannot create isolated MQTT emulator lab: ${result.error}`);
  return result.value;
}

function requireKind<K extends TopologyKind>(
  node: TopologyNode,
  kind: K,
): Extract<TopologyNode, { kind: K }> {
  if (node.kind !== kind) throw new Error(`Emulator lab topology conflict: expected ${kind}`);
  return node as Extract<TopologyNode, { kind: K }>;
}

function structureFor(serial: string): BdfbStructureSpec {
  const panel = (name: (typeof PANELS)[number], index: number) => ({
    id: `lab-${serial}-panel-${name.toLowerCase()}`,
    label: name,
    positions: Array.from({ length: POSITIONS_PER_PANEL }, (_, position) => ({
      id: `lab-${serial}-breaker-${name.toLowerCase()}-${String(position + 1).padStart(2, '0')}`,
      label: `${name}-${String(position + 1).padStart(2, '0')}`,
      telemetry: { rawPointId: `0_${index}_${position + 1}` },
    })),
  });

  return {
    shelves: [
      {
        id: `lab-${serial}-shelf-a`,
        label: 'Feed A (synthetic)',
        frames: [{
          id: `lab-${serial}-frame-a`,
          label: 'Feed A',
          panels: [panel('A1', 1), panel('A2', 2)],
        }],
      },
      {
        id: `lab-${serial}-shelf-b`,
        label: 'Feed B (synthetic)',
        frames: [{
          id: `lab-${serial}-frame-b`,
          label: 'Feed B',
          panels: [panel('B1', 3), panel('B2', 4)],
        }],
      },
    ],
  };
}

async function upsertBinding(
  repository: TelemetryBindingRepository,
  binding: TelemetryBinding,
): Promise<void> {
  const existing = (await repository.listForSource(binding.protocol, binding.sourceIdentity)).find(
    (candidate) => candidate.id === binding.id,
  );
  if (existing) await repository.replace(binding);
  else await repository.insert(binding);
}

export interface EmulatorLabDevice {
  readonly serial: string;
  readonly deviceId: string;
  readonly breakerCount: number;
  readonly href: string;
}

export async function seedBfdbEmulatorLab(
  repository: TopologyRepository,
  powerRepository?: PowerRepository,
  telemetryBindings?: TelemetryBindingRepository,
): Promise<readonly EmulatorLabDevice[]> {
  const paths = powerRepository ?? new MemoryPowerRepository();
  const topology = new TopologyService(repository);

  const network = requireKind(
    await ensureNode(repository, topology, {
      kind: 'NETWORK',
      parentId: null,
      name: 'MQTT EMULATOR LAB (SYNTHETIC)',
    }),
    'NETWORK',
  );
  const site = await ensureNode(repository, topology, {
    kind: 'SITE',
    parentId: network.id,
    name: 'Virtual emulator',
    polygon: polygon(6000, 4800),
  });
  const building = await ensureNode(repository, topology, {
    kind: 'STRUCTURE',
    parentId: site.id,
    name: 'Unsurveyed emulator topology',
    polygon: polygon(5400, 4200),
  });
  const level = await ensureNode(repository, topology, {
    kind: 'LEVEL',
    parentId: building.id,
    name: 'Logical Level',
  });
  const room = await ensureNode(repository, topology, {
    kind: 'ROOM_SUBSTRUCTURE',
    parentId: level.id,
    name: 'Virtual BFDB room (no physical geometry)',
    roomVariant: 'ROOM',
    polygon: polygon(3600, 3600),
  });
  const bay = await ensureNode(repository, topology, {
    kind: 'CONTAINER_CLUSTER_BAY',
    parentId: room.id,
    name: 'Logical devices (unplaced)',
    clusterVariant: 'BAY',
    polygon: [
      { x: 0, y: 2400 },
      { x: 1800, y: 2400 },
      { x: 1800, y: 3000 },
      { x: 0, y: 3000 },
    ],
  });

  const bdfbService = new BdfbService(repository);
  const projectionService = new BdfbProjectionService(repository);
  const output: EmulatorLabDevice[] = [];

  for (const [index, serial] of EMULATOR_SERIALS.entries()) {
    const position = await ensureNode(repository, topology, {
      kind: 'POSITION',
      parentId: bay.id,
      name: `Logical position ${index + 1}`,
      coordinate: { row: 'E', column: index + 1 },
    });
    const rack = await ensureNode(repository, topology, {
      kind: 'CONTAINER_RACK',
      parentId: position.id,
      name: `LAB-RACK-${String(index + 1).padStart(2, '0')}`,
      containerVariant: 'RACK',
      totalU: 42,
    });
    const device = requireKind(
      await ensureNode(repository, topology, {
        kind: 'DEVICE',
        parentId: rack.id,
        name: `BFDB-${String(index + 1).padStart(2, '0')} (emulated)`,
        serialNumber: serial,
        category: 'MQTT synthetic commissioning fixture',
        deviceType: 'BDFB',
      }),
      'DEVICE',
    );
    if (device.serialNumber !== serial) {
      throw new Error(`Lab identity conflict for ${serial}; refusing silent remapping`);
    }

    if (!Array.isArray(device.rootEquipmentIds) || device.rootEquipmentIds.length === 0) {
      const configured = await bdfbService.configure(device.id, structureFor(serial));
      if (!configured.ok) {
        throw new Error(`Emulator lab BFDB binding failed: ${configured.error}`);
      }
    }

    const presentation = await projectionService.get(device.id);
    if (!presentation) throw new Error(`Emulator lab projection unavailable for ${serial}`);
    const breakers = presentation.shelves.flatMap((shelf) =>
      shelf.frames.flatMap((frame) =>
        frame.panels.flatMap((panel) => panel.positions.filter((item) => item !== null)),
      ),
    );
    if (breakers.length !== 96) {
      throw new Error(`Emulator lab binding drift for ${serial}; expected 96 breakers`);
    }

    if (telemetryBindings) {
      const timestamp = new Date().toISOString();
      await upsertBinding(telemetryBindings, {
        id: `lab:mqtt:${serial}:source`,
        protocol: 'MQTT',
        sourceIdentity: serial,
        targetType: 'DEVICE',
        targetId: device.id,
        lifecycle: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      for (const breaker of breakers) {
        if (!breaker.rawPointId) continue;
        await upsertBinding(telemetryBindings, {
          id: `lab:mqtt:${serial}:${breaker.rawPointId}`,
          protocol: 'MQTT',
          sourceIdentity: serial,
          sourcePointId: breaker.rawPointId,
          targetType: 'EQUIPMENT',
          targetId: breaker.id,
          lifecycle: 'ACTIVE',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }

    output.push({
      serial,
      deviceId: device.id,
      breakerCount: breakers.length,
      href: await topology.buildDeepLink(device.id),
    });
  }

  const loadPosition = await ensureNode(repository, topology, {
    kind: 'POSITION',
    parentId: bay.id,
    name: 'Logical dual-feed load position',
    coordinate: { row: 'E', column: 4 },
  });
  const loadRack = await ensureNode(repository, topology, {
    kind: 'CONTAINER_RACK',
    parentId: loadPosition.id,
    name: 'LAB-RACK-LOAD',
    containerVariant: 'RACK',
    totalU: 42,
  });
  const load = requireKind(
    await ensureNode(repository, topology, {
      kind: 'DEVICE',
      parentId: loadRack.id,
      name: 'DEVICE-X (dual-feed MQTT demo)',
      serialNumber: 'EMU-LOAD-DEVICE-X',
      category: 'Synthetic dual-feed commissioning load',
      deviceType: 'NETWORK_ELEMENT',
    }),
    'DEVICE',
  );

  const portA = `${load.id}:power-in-a`;
  const portB = `${load.id}:power-in-b`;
  const powerContract = await new PowerContractService(repository).update(load.id, {
    accessPorts: [
      { id: portA, label: 'POWER-IN-A', feed: 'A' },
      { id: portB, label: 'POWER-IN-B', feed: 'B' },
    ],
    redundancy: 'A_B_REQUIRED',
  });
  if (!powerContract.ok) {
    throw new Error(`Emulator load power contract failed: ${powerContract.error}`);
  }

  const deviceBySerial = new Map(output.map((item) => [item.serial, item.deviceId] as const));
  const sourceAId = deviceBySerial.get('EMU-BFDB-01');
  const sourceBId = deviceBySerial.get('EMU-BFDB-02');
  if (!sourceAId || !sourceBId) {
    throw new Error('Dual-feed emulator fixture requires EMU-BFDB-01 and EMU-BFDB-02.');
  }

  const sourceA = await projectionService.get(sourceAId);
  const sourceB = await projectionService.get(sourceBId);
  const breakerA = sourceA?.shelves
    .flatMap((shelf) => shelf.frames)
    .flatMap((frame) => frame.panels)
    .flatMap((panel) => panel.positions)
    .find((breaker) => breaker?.rawPointId === '0_1_7');
  const breakerB = sourceB?.shelves
    .flatMap((shelf) => shelf.frames)
    .flatMap((frame) => frame.panels)
    .flatMap((panel) => panel.positions)
    .find((breaker) => breaker?.rawPointId === '0_3_12');
  if (!breakerA || !breakerB) throw new Error('Dual-feed emulator breaker fixtures unavailable.');

  const activePaths = await paths.listActive();
  const power = new PowerService(repository, paths);

  for (const input of [
    {
      sourceAccessPortId: breakerA.accessPortId,
      targetAccessPortId: portA,
      feed: 'A' as const,
      label: 'Primary feed · EMU-BFDB-01 / A1-07',
    },
    {
      sourceAccessPortId: breakerB.accessPortId,
      targetAccessPortId: portB,
      feed: 'B' as const,
      label: 'Secondary feed · EMU-BFDB-02 / B1-12',
    },
  ]) {
    const exists = activePaths.some(
      (path) =>
        path.lifecycle === 'ACTIVE' &&
        path.sourceAccessPortId === input.sourceAccessPortId &&
        path.targetAccessPortId === input.targetAccessPortId &&
        path.feed === input.feed,
    );
    if (exists) continue;

    const created = await power.create(input);
    if (!created.ok) throw new Error(`Dual-feed emulator PowerPath failed: ${created.error}`);
  }

  return output;
}
