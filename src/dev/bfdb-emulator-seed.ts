import { BdfbService } from '@/modules/power/application/bdfb-service';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import {
  TopologyService,
  type CreateTopologyNodeInput,
} from '@/modules/topology/application/topology-service';
import type {
  BdfbStructure,
  DeviceNode,
  TopologyKind,
  TopologyNode,
} from '@/modules/topology/domain/entities';

export const EMULATOR_SERIALS = [
  'EMU-BFDB-01',
  'EMU-BFDB-02',
  'EMU-BFDB-03',
] as const;

const PANELS = ['A1', 'A2', 'B1', 'B2'] as const;
const POSITIONS_PER_PANEL = 24;

async function ensureNode(
  repository: TopologyRepository,
  service: TopologyService,
  input: CreateTopologyNodeInput,
): Promise<TopologyNode> {
  const siblings = input.parentId
    ? await repository.listChildren(input.parentId)
    : await repository.listByKind('NETWORK');
  const existing = siblings.find(
    (node) =>
      node.lifecycle === 'ACTIVE' &&
      node.kind === input.kind &&
      node.name === input.name,
  );

  if (existing) return existing;

  const result = await service.create(input);
  if (!result.ok) {
    throw new Error(`Cannot create isolated MQTT emulator lab: ${result.error}`);
  }
  return result.value;
}

function requireKind<K extends TopologyKind>(
  node: TopologyNode,
  kind: K,
): Extract<TopologyNode, { kind: K }> {
  if (node.kind !== kind) {
    throw new Error(`Emulator lab topology conflict: expected ${kind}`);
  }
  return node as Extract<TopologyNode, { kind: K }>;
}

/**
 * A synthetic MQTT commissioning fixture, never customer physical inventory.
 * Point identities are copied from the current bfdb-telemetry-gateway lab
 * contract (A1, A2, B1, B2; 24 positions per panel).
 */
function structureFor(serial: string): BdfbStructure {
  const panel = (name: (typeof PANELS)[number], index: number) => ({
    id: `lab-${serial}-panel-${name.toLowerCase()}`,
    label: name,
    endpoints: Array.from({ length: POSITIONS_PER_PANEL }, (_, position) => ({
      id: `lab-${serial}-breaker-${name.toLowerCase()}-${String(position + 1).padStart(2, '0')}`,
      variant: 'BREAKER' as const,
      label: `${name}-${String(position + 1).padStart(2, '0')}`,
      telemetry: { rawPointId: `0_${index}_${position + 1}` },
    })),
  });

  return {
    shelves: [
      {
        id: `lab-${serial}-shelf-a`,
        label: 'Feed A (synthetic)',
        frames: [
          {
            id: `lab-${serial}-frame-a`,
            label: 'Feed A',
            panels: [panel('A1', 1), panel('A2', 2)],
          },
        ],
      },
      {
        id: `lab-${serial}-shelf-b`,
        label: 'Feed B (synthetic)',
        frames: [
          {
            id: `lab-${serial}-frame-b`,
            label: 'Feed B',
            panels: [panel('B1', 3), panel('B2', 4)],
          },
        ],
      },
    ],
  };
}

function explicitPoints(device: DeviceNode): Set<string> {
  return new Set(
    (device.bdfb?.shelves ?? []).flatMap((shelf) =>
      shelf.frames.flatMap((frame) =>
        frame.panels.flatMap((panel) =>
          panel.endpoints.flatMap((breaker) =>
            breaker.telemetry?.rawPointId ? [breaker.telemetry.rawPointId] : [],
          ),
        ),
      ),
    ),
  );
}

export interface EmulatorLabDevice {
  readonly serial: string;
  readonly deviceId: string;
  readonly breakerCount: number;
  readonly href: string;
}

export async function seedBfdbEmulatorLab(
  repository: TopologyRepository,
): Promise<readonly EmulatorLabDevice[]> {
  const topology = new TopologyService(repository);

  // The lab lives in its own explicitly synthetic network. No surveyed
  // coordinates are manufactured and the existing ZIP demo is untouched.
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
  });
  const building = await ensureNode(repository, topology, {
    kind: 'STRUCTURE',
    parentId: site.id,
    name: 'Unsurveyed emulator topology',
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
  });
  const bay = await ensureNode(repository, topology, {
    kind: 'CONTAINER_CLUSTER_BAY',
    parentId: room.id,
    name: 'Logical devices (unplaced)',
    clusterVariant: 'BAY',
  });
  const bdfbService = new BdfbService(repository);
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
    const node = requireKind(
      await ensureNode(repository, topology, {
        kind: 'DEVICE',
        parentId: rack.id,
        name: `BFDB-${String(index + 1).padStart(2, '0')} (emulated)`,
        serialNumber: serial,
        category: 'MQTT synthetic commissioning fixture',
      }),
      'DEVICE',
    );

    if (node.serialNumber !== serial) {
      throw new Error(`Lab identity conflict for ${serial}; refusing silent remapping`);
    }
    const existingPoints = explicitPoints(node);
    const expectedPoints = explicitPoints({
      ...node,
      bdfb: structureFor(serial),
    });

    if (!node.bdfb) {
      const configured = await bdfbService.configure(node.id, structureFor(serial));
      if (!configured.ok) {
        throw new Error(`Emulator lab BFDB binding failed: ${configured.error}`);
      }
    } else if (
      existingPoints.size !== 96 ||
      [...expectedPoints].some((point) => !existingPoints.has(point))
    ) {
      throw new Error(`Emulator lab binding drift for ${serial}; refusing to overwrite it`);
    }

    output.push({
      serial,
      deviceId: node.id,
      breakerCount: 96,
      href: await topology.buildDeepLink(node.id),
    });
  }

  return output;
}
