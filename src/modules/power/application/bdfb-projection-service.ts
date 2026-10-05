import type {
  BdfbBreakerView,
  BdfbFrameView,
  BdfbPanelView,
  BdfbPresentation,
  BdfbShelfView,
} from '@/modules/power/domain/bdfb-model';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

function stringAttribute(node: EquipmentNode, key: string): string | undefined {
  const value = node.attributes?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberAttribute(node: EquipmentNode, key: string): number | undefined {
  const value = node.attributes?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function breakerView(node: EquipmentNode | undefined): BdfbBreakerView | null {
  if (!node || node.equipmentType !== 'CIRCUIT_BREAKER') return null;
  const power = node.accessPorts.find(
    (port) =>
      port.lifecycle === 'ACTIVE' && port.portType === 'POWER' && port.direction === 'OUTPUT',
  );
  if (!power) return null;

  const capacity = numberAttribute(node, 'capacity');
  const rawPointId = stringAttribute(node, 'telemetryRawPointId');
  return {
    id: node.id,
    label: node.name,
    accessPortId: power.id,
    ...(capacity === undefined ? {} : { capacity }),
    ...(rawPointId ? { rawPointId } : {}),
  };
}

function panelView(
  node: EquipmentNode,
  byId: ReadonlyMap<string, EquipmentNode>,
): BdfbPanelView | null {
  if (node.equipmentType !== 'PANEL') return null;
  return {
    id: node.id,
    label: node.name,
    positions: node.children.map((id) => (id ? breakerView(byId.get(id)) : null)),
  };
}

export class BdfbProjectionService {
  constructor(private readonly topology: TopologyRepository) {}

  async get(deviceId: string): Promise<BdfbPresentation | null> {
    const device = await this.topology.getById(deviceId);
    if (!device || device.kind !== 'DEVICE' || device.deviceType !== 'BDFB') return null;

    const equipment = (await this.topology.listEquipmentForDevice(device.id)).filter(
      (item) => item.lifecycle === 'ACTIVE',
    );
    const byId = new Map(equipment.map((item) => [item.id, item]));
    const rootEquipmentIds = Array.isArray(device.rootEquipmentIds) ? device.rootEquipmentIds : [];
    const chassis = rootEquipmentIds
      .map((id) => byId.get(id))
      .find((item) => item?.equipmentType === 'CHASSIS');
    if (!chassis) return null;

    const shelves: BdfbShelfView[] = [];

    for (const shelfId of chassis.children) {
      if (!shelfId) continue;
      const shelf = byId.get(shelfId);
      if (!shelf || shelf.equipmentType !== 'SHELF') continue;

      const frames = new Map<string, BdfbFrameView>();
      for (const childId of shelf.children) {
        if (!childId) continue;
        const child = byId.get(childId);
        if (!child) continue;

        if (child.equipmentType === 'FRAME') {
          const panels = child.children
            .map((id) => (id ? byId.get(id) : undefined))
            .filter((item): item is EquipmentNode => Boolean(item))
            .map((item) => panelView(item, byId))
            .filter((item): item is BdfbPanelView => Boolean(item));

          frames.set(child.id, {
            id: child.id,
            label: child.name,
            physical: true,
            panels,
          });
          continue;
        }

        if (child.equipmentType === 'PANEL') {
          const view = panelView(child, byId);
          if (!view) continue;
          const key = stringAttribute(child, 'presentationFrameId') ?? shelf.id + ':direct';
          const current = frames.get(key);
          frames.set(key, {
            id: key,
            label: stringAttribute(child, 'presentationFrameLabel') ?? 'Direct mount',
            physical: false,
            panels: [...(current?.panels ?? []), view],
          });
        }
      }

      shelves.push({
        id: shelf.id,
        label: shelf.name,
        frames: [...frames.values()],
      });
    }

    return { deviceId: device.id, chassisId: chassis.id, shelves };
  }
}
