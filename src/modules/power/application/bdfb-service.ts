import { validateBdfb, type BdfbValidationError } from '@/modules/power/domain/bdfb-validation';
import type {
  BdfbBreakerSpec,
  BdfbFrameSpec,
  BdfbPanelSpec,
  BdfbShelfSpec,
  BdfbStructureSpec,
} from '@/modules/power/domain/bdfb-model';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type {
  AccessPort,
  DeviceNode,
  EquipmentNode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import { nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type BdfbError =
  | BdfbValidationError
  | 'DEVICE_NOT_FOUND'
  | 'NOT_A_DEVICE'
  | 'DEVICE_ARCHIVED'
  | 'DEVICE_ALREADY_MATERIALIZED';

function equipmentId(deviceId: string, localId: string): string {
  return deviceId + ':equipment:' + localId;
}

function powerPort(deviceId: string, breaker: BdfbBreakerSpec): AccessPort {
  const id = equipmentId(deviceId, breaker.id);
  return {
    id: id + ':power-out',
    deviceId,
    equipmentId: id,
    name: 'Power output',
    portType: 'POWER',
    direction: 'OUTPUT',
    exposure: 'EXTERNAL',
    lifecycle: 'ACTIVE',
  };
}

function baseEquipment(
  device: DeviceNode,
  id: string,
  parentId: string,
  parentEquipmentId: string | null,
  name: string,
  equipmentType: EquipmentType,
  children: readonly (string | null)[],
  childMode: EquipmentNode['childMode'],
  timestamp: string,
  attributes?: Readonly<Record<string, unknown>>,
  accessPorts: readonly AccessPort[] = [],
): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    parentId,
    deviceId: device.id,
    name,
    equipmentType,
    parentEquipmentId,
    childMode,
    children,
    accessPorts,
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(attributes ? { attributes } : {}),
  };
}

interface MaterializedChildren {
  readonly childIds: readonly string[];
  readonly equipment: readonly EquipmentNode[];
}

export class BdfbService {
  constructor(private readonly topology: TopologyRepository) {}

  async configure(
    deviceId: string,
    structure: BdfbStructureSpec,
  ): Promise<Result<DeviceNode, BdfbError>> {
    const node = await this.topology.getById(deviceId);
    if (!node) return failure('DEVICE_NOT_FOUND');
    if (node.kind !== 'DEVICE') return failure('NOT_A_DEVICE');
    if (node.lifecycle !== 'ACTIVE') return failure('DEVICE_ARCHIVED');
    if (node.rootEquipmentIds.length > 1) return failure('DEVICE_ALREADY_MATERIALIZED');

    const existingRoot =
      node.rootEquipmentIds.length === 1
        ? await this.topology.getById(node.rootEquipmentIds[0]!)
        : null;
    if (
      existingRoot &&
      (existingRoot.kind !== 'EQUIPMENT' ||
        existingRoot.lifecycle !== 'ACTIVE' ||
        existingRoot.deviceId !== node.id ||
        existingRoot.parentEquipmentId !== null ||
        existingRoot.children.length > 0)
    ) {
      return failure('DEVICE_ALREADY_MATERIALIZED');
    }

    const validation = validateBdfb(structure);
    if (!validation.ok) return failure(validation.error);

    const timestamp = nowIso();
    const chassisId =
      existingRoot?.kind === 'EQUIPMENT'
        ? existingRoot.id
        : equipmentId(node.id, 'bdfb-chassis');

    const materializePanel = (
      panel: BdfbPanelSpec,
      parentId: string,
      presentationFrame?: BdfbFrameSpec,
    ): readonly EquipmentNode[] => {
      const panelId = equipmentId(node.id, panel.id);
      const children = panel.positions.map((breaker) =>
        breaker ? equipmentId(node.id, breaker.id) : null,
      );
      const panelNode = baseEquipment(
        node,
        panelId,
        parentId,
        parentId,
        panel.label,
        'PANEL',
        children,
        'POSITIONAL',
        timestamp,
        {
          bdfbRole: 'PANEL',
          legacyId: panel.id,
          ...(presentationFrame
            ? {
                presentationFrameId: presentationFrame.id,
                presentationFrameLabel: presentationFrame.label,
                presentationFramePhysical: false,
              }
            : {}),
        },
      );

      const breakers = panel.positions.flatMap((breaker) => {
        if (!breaker) return [];
        const breakerId = equipmentId(node.id, breaker.id);
        return [
          baseEquipment(
            node,
            breakerId,
            panelId,
            panelId,
            breaker.label,
            'CIRCUIT_BREAKER',
            [],
            'DYNAMIC',
            timestamp,
            {
              bdfbRole: 'CIRCUIT_BREAKER',
              legacyId: breaker.id,
              ...(breaker.capacity === undefined ? {} : { capacity: breaker.capacity }),
              ...(breaker.telemetry?.rawPointId
                ? { telemetryRawPointId: breaker.telemetry.rawPointId }
                : {}),
            },
            [powerPort(node.id, breaker)],
          ),
        ];
      });

      return [panelNode, ...breakers];
    };

    const materializeFrame = (frame: BdfbFrameSpec, parentId: string): MaterializedChildren => {
      const physical = frame.physicalFrameVisible !== false;
      const frameId = equipmentId(node.id, frame.id);
      const panelIds = frame.panels.map((panel) => equipmentId(node.id, panel.id));

      if (!physical) {
        return {
          childIds: panelIds,
          equipment: frame.panels.flatMap((panel) => materializePanel(panel, parentId, frame)),
        };
      }

      return {
        childIds: [frameId],
        equipment: [
          baseEquipment(
            node,
            frameId,
            parentId,
            parentId,
            frame.label,
            'FRAME',
            panelIds,
            'DYNAMIC',
            timestamp,
            { bdfbRole: 'FRAME', legacyId: frame.id },
          ),
          ...frame.panels.flatMap((panel) => materializePanel(panel, frameId)),
        ],
      };
    };

    const materializeShelf = (shelf: BdfbShelfSpec): readonly EquipmentNode[] => {
      const shelfId = equipmentId(node.id, shelf.id);
      const nestedFrames = (shelf.frames ?? []).map((frame) => materializeFrame(frame, shelfId));
      const directPanels = shelf.panels ?? [];
      const childIds = [
        ...nestedFrames.flatMap((entry) => entry.childIds),
        ...directPanels.map((panel) => equipmentId(node.id, panel.id)),
      ];

      return [
        baseEquipment(
          node,
          shelfId,
          chassisId,
          chassisId,
          shelf.label,
          'SHELF',
          childIds,
          'DYNAMIC',
          timestamp,
          { bdfbRole: 'SHELF', legacyId: shelf.id },
        ),
        ...nestedFrames.flatMap((entry) => entry.equipment),
        ...directPanels.flatMap((panel) => materializePanel(panel, shelfId)),
      ];
    };

    const shelves = structure.shelves ?? [];
    const directFrames = (structure.frames ?? []).map((frame) => materializeFrame(frame, chassisId));
    const directPanels = structure.panels ?? [];
    const chassisChildren = [
      ...shelves.map((shelf) => equipmentId(node.id, shelf.id)),
      ...directFrames.flatMap((entry) => entry.childIds),
      ...directPanels.map((panel) => equipmentId(node.id, panel.id)),
    ];

    const chassis: EquipmentNode =
      existingRoot?.kind === 'EQUIPMENT'
        ? {
            ...existingRoot,
            parentId: node.id,
            deviceId: node.id,
            equipmentType: 'CHASSIS',
            parentEquipmentId: null,
            childMode: 'DYNAMIC',
            children: chassisChildren,
            attributes: {
              ...(existingRoot.attributes ?? {}),
              bdfbRole: 'CHASSIS',
            },
            updatedAt: timestamp,
          }
        : baseEquipment(
            node,
            chassisId,
            node.id,
            null,
            node.name + ' Chassis',
            'CHASSIS',
            chassisChildren,
            'DYNAMIC',
            timestamp,
            { bdfbRole: 'CHASSIS' },
          );

    const descendants: EquipmentNode[] = [
      ...shelves.flatMap(materializeShelf),
      ...directFrames.flatMap((entry) => entry.equipment),
      ...directPanels.flatMap((panel) => materializePanel(panel, chassisId)),
    ];

    if (existingRoot?.kind === 'EQUIPMENT') {
      await this.topology.replace(chassis);
    } else {
      await this.topology.insert(chassis);
    }
    for (const equipment of descendants) {
      await this.topology.insert(equipment);
    }

    const updated: DeviceNode = {
      ...node,
      deviceType: 'BDFB',
      rootEquipmentIds: [chassisId],
      updatedAt: timestamp,
    };
    await this.topology.replace(updated);
    return success(updated);
  }
}
