import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission('alarms:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const topology = await createTopologyRepository();
  const devices = (await topology.listByKind('DEVICE'))
    .filter(
      (node) => node.kind === 'DEVICE' && node.lifecycle === 'ACTIVE' && node.deviceType === 'BDFB',
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const targets: Array<{
    scope: 'GLOBAL' | 'QDF' | 'PANEL' | 'BREAKER';
    id: string | null;
    deviceName?: string;
    panelName?: string;
    breakerName?: string;
  }> = [{ scope: 'GLOBAL', id: null }];

  for (const device of devices) {
    targets.push({ scope: 'QDF', id: device.id, deviceName: device.name });

    const equipment = (await topology.listEquipmentForDevice(device.id)).filter(
      (node) => node.lifecycle === 'ACTIVE',
    );
    const byId = new Map(equipment.map((node) => [node.id, node]));
    const panels = equipment
      .filter((node) => node.equipmentType === 'PANEL')
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const panel of panels) {
      targets.push({
        scope: 'PANEL',
        id: panel.id,
        deviceName: device.name,
        panelName: panel.name,
      });
    }

    const breakers = equipment
      .filter((node) => node.equipmentType === 'CIRCUIT_BREAKER')
      .map((breaker) => {
        const panel = breaker.parentEquipmentId ? byId.get(breaker.parentEquipmentId) : undefined;
        return { breaker, panel };
      })
      .filter(
        (item): item is typeof item & { panel: NonNullable<typeof item.panel> } =>
          item.panel?.equipmentType === 'PANEL',
      )
      .sort(
        (a, b) =>
          a.panel.name.localeCompare(b.panel.name) || a.breaker.name.localeCompare(b.breaker.name),
      );

    for (const { breaker, panel } of breakers) {
      targets.push({
        scope: 'BREAKER',
        id: breaker.id,
        deviceName: device.name,
        panelName: panel.name,
        breakerName: breaker.name,
      });
    }
  }

  return NextResponse.json(
    { targets },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
