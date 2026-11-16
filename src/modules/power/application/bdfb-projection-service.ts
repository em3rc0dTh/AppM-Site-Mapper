import type {
  BdfbBreakerView,
  BdfbFrameView,
  BdfbPanelView,
  BdfbPresentation,
  BdfbShelfView,
} from '@/modules/power/domain/bdfb-model';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

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
  return {
    id: node.id,
    label: node.name,
    accessPortId: power.id,
    ...(capacity === undefined ? {} : { capacity }),
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

function frameViews(
  childIds: readonly (string | null)[],
  byId: ReadonlyMap<string, EquipmentNode>,
): readonly BdfbFrameView[] {
  const frames = new Map<string, BdfbFrameView>();

  for (const childId of childIds) {
    if (!childId) continue;
    const child = byId.get(childId);
    if (!child) continue;

    if (child.equipmentType === 'FRAME') {
      const panels = child.children
        .map((id) => (id ? byId.get(id) : undefined))
        .filter((item): item is EquipmentNode => Boolean(item))
        .map((item) => panelView(item, byId))
        .filter((item): item is BdfbPanelView => Boolean(item));
      frames.set(child.id, { id: child.id, label: child.name, physical: true, panels });
      continue;
    }

    if (child.equipmentType === 'PANEL') {
      const view = panelView(child, byId);
      if (!view) continue;
      const key = child.parentId + ':direct';
      const current = frames.get(key);
      frames.set(key, {
        id: key,
        label: 'Direct mount',
        physical: false,
        panels: [...(current?.panels ?? []), view],
      });
    }
  }

  return [...frames.values()];
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
    const directChildIds: (string | null)[] = [];

    for (const childId of chassis.children) {
      if (!childId) continue;
      const child = byId.get(childId);
      if (!child) continue;

      if (child.equipmentType === 'SHELF') {
        shelves.push({
          id: child.id,
          label: child.name,
          physical: true,
          frames: frameViews(child.children, byId),
        });
      } else if (child.equipmentType === 'FRAME' || child.equipmentType === 'PANEL') {
        directChildIds.push(child.id);
      }
    }

    if (directChildIds.length > 0) {
      shelves.push({
        id: chassis.id + ':presentation:direct',
        label: 'Direct chassis mount',
        physical: false,
        frames: frameViews(directChildIds, byId),
      });
    }

    return { deviceId: device.id, chassisId: chassis.id, shelves };
  }
}
