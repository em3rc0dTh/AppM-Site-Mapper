import { validateBdfb, type BdfbValidationError } from '@/modules/power/domain/bdfb-validation';
import type { BdfbBreakerSpec, BdfbStructureSpec } from '@/modules/power/domain/bdfb-model';
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
    if (node.rootEquipmentIds.length > 0) return failure('DEVICE_ALREADY_MATERIALIZED');

    const validation = validateBdfb(structure);
    if (!validation.ok) return failure(validation.error);

    const timestamp = nowIso();
    const chassisId = equipmentId(node.id, 'bdfb-chassis');
    const shelfIds = structure.shelves.map((shelf) => equipmentId(node.id, shelf.id));

    const materialized: EquipmentNode[] = [
      baseEquipment(
        node,
        chassisId,
        node.id,
        null,
        node.name + ' Chassis',
        'CHASSIS',
        shelfIds,
        'DYNAMIC',
        timestamp,
        { bdfbRole: 'CHASSIS' },
      ),
    ];

    for (const shelf of structure.shelves) {
      const shelfId = equipmentId(node.id, shelf.id);
      const shelfChildren: string[] = [];

      for (const frame of shelf.frames) {
        const physical = frame.physicalFrameVisible !== false;
        const frameId = equipmentId(node.id, frame.id);

        if (physical) {
          shelfChildren.push(frameId);
          materialized.push(
            baseEquipment(
              node,
              frameId,
              shelfId,
              shelfId,
              frame.label,
              'FRAME',
              frame.panels.map((panel) => equipmentId(node.id, panel.id)),
              'DYNAMIC',
              timestamp,
              { bdfbRole: 'FRAME', legacyId: frame.id },
            ),
          );
        }

        for (const panel of frame.panels) {
          const panelId = equipmentId(node.id, panel.id);
          const panelParentId = physical ? frameId : shelfId;
          if (!physical) shelfChildren.push(panelId);

          const children = panel.positions.map((breaker) =>
            breaker ? equipmentId(node.id, breaker.id) : null,
          );

          materialized.push(
            baseEquipment(
              node,
              panelId,
              panelParentId,
              panelParentId,
              panel.label,
              'PANEL',
              children,
              'POSITIONAL',
              timestamp,
              {
                bdfbRole: 'PANEL',
                legacyId: panel.id,
                presentationFrameId: frame.id,
                presentationFrameLabel: frame.label,
                presentationFramePhysical: physical,
              },
            ),
          );

          for (const breaker of panel.positions) {
            if (!breaker) continue;
            const breakerId = equipmentId(node.id, breaker.id);
            const port = powerPort(node.id, breaker);

            materialized.push(
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
                [port],
              ),
            );
          }
        }
      }

      materialized.push(
        baseEquipment(
          node,
          shelfId,
          chassisId,
          chassisId,
          shelf.label,
          'SHELF',
          shelfChildren,
          'DYNAMIC',
          timestamp,
          { bdfbRole: 'SHELF', legacyId: shelf.id },
        ),
      );
    }

    for (const equipment of materialized) {
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
