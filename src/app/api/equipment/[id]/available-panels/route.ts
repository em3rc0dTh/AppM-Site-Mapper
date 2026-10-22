import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { bdfbHardwareProfile } from '@/modules/power/domain/bdfb-hardware-profile';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

/**
 * Read-only, database-backed physical panel picker for a BDFB terminal.
 * Restrict the result to the same Device as the edited Equipment, never to
 * every PANEL in the network. ID lookup is server-side and uses the canonical
 * TopologyRepository (MongoDB in the persisted Docker lab).
 */
export async function GET(_request: Request, context: Context) {
  const permission = await requirePermission('topology:read');
  if (!permission.ok) return NextResponse.json({ error: permission.error }, { status: 401 });

  const { id } = await context.params;
  if (!id || id.length > 160) {
    return NextResponse.json({ error: 'INVALID_EQUIPMENT_ID' }, { status: 400 });
  }
  const repository = await createTopologyRepository();
  const equipment = await repository.getById(id);
  if (equipment?.kind !== 'EQUIPMENT' || equipment.lifecycle !== 'ACTIVE') {
    return NextResponse.json({ error: 'EQUIPMENT_NOT_FOUND' }, { status: 404 });
  }
  const device = await repository.getById(equipment.deviceId);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE') {
    return NextResponse.json({ error: 'NOT_A_BDFB_EQUIPMENT' }, { status: 422 });
  }

  const inventory = (await repository.listEquipmentForDevice(equipment.deviceId)).filter(
    (node) => node.lifecycle === 'ACTIVE',
  );
  const byId = new Map(inventory.map((node) => [node.id, node]));
  const assigned = new Map<string, { id: string; name: string }>();
  for (const owner of inventory) {
    for (const port of owner.accessPorts) {
      if (port.lifecycle !== 'ACTIVE' || port.attributes?.snmpFeedInput !== true) continue;
      const ids = port.attributes?.servedPanelIds;
      if (!Array.isArray(ids)) continue;
      for (const panelId of ids) {
        if (typeof panelId === 'string' && !assigned.has(panelId)) {
          assigned.set(panelId, { id: port.id, name: port.name });
        }
      }
    }
  }

  const panels = inventory
    .filter((node): node is EquipmentNode => node.equipmentType === 'PANEL')
    .map((panel) => {
      const frame = panel.parentEquipmentId ? byId.get(panel.parentEquipmentId) : undefined;
      const port = assigned.get(panel.id);
      return {
        id: panel.id,
        name: panel.name,
        frameName: frame?.name ?? 'Unknown frame',
        ...(port ? { assignedPortId: port.id, assignedPortName: port.name } : {}),
      };
    })
    .sort((a, b) => a.frameName.localeCompare(b.frameName) || a.name.localeCompare(b.name));

  return NextResponse.json(
    {
      deviceId: equipment.deviceId,
      equipmentType: equipment.equipmentType,
      hardwareProfile: bdfbHardwareProfile(device),
      panels,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
