import { notFound, redirect } from 'next/navigation';

import { ConnectPowerForm } from '@/components/power/connect-power-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

function feedOf(attributes: Readonly<Record<string, unknown>> | undefined): 'A' | 'B' | undefined {
  const value = attributes?.feed;
  return value === 'A' || value === 'B' ? value : undefined;
}

export default async function ConnectPowerPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    entity?: string;
    shelf?: string;
    frame?: string;
    panel?: string;
    breaker?: string;
  }>;
}>) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) redirect('/workspace');

  const query = await searchParams;
  if (!query.entity || !query.shelf || !query.frame || !query.panel || !query.breaker) {
    redirect('/power');
  }

  const topology = await createTopologyRepository();
  const topologyService = new TopologyService(topology);
  const sourceDevice = await topology.getById(query.entity);
  if (!sourceDevice || sourceDevice.kind !== 'DEVICE' || sourceDevice.lifecycle !== 'ACTIVE') {
    notFound();
  }

  const presentation = await new BdfbProjectionService(topology).get(sourceDevice.id);
  const shelf = presentation?.shelves.find((item) => item.id === query.shelf);
  const frame = shelf?.frames.find((item) => item.id === query.frame);
  const panel = frame?.panels.find((item) => item.id === query.panel);
  const breaker = panel?.positions.find((item) => item?.id === query.breaker) ?? null;
  if (!presentation || !shelf || !frame || !panel || !breaker) notFound();

  const selfHref = await topologyService.buildDeepLink(sourceDevice.id);
  const returnHref = `${selfHref}?panel=${encodeURIComponent(panel.id)}&breaker=${encodeURIComponent(breaker.id)}`;

  const equipment = (await topology.listByKind('EQUIPMENT')).filter(
    (node): node is EquipmentNode =>
      node.kind === 'EQUIPMENT' &&
      node.lifecycle === 'ACTIVE' &&
      node.deviceId !== sourceDevice.id &&
      node.accessPorts.some(
        (port) =>
          port.lifecycle === 'ACTIVE' && port.portType === 'POWER' && port.direction !== 'OUTPUT',
      ),
  );

  const destinations = await Promise.all(
    equipment.map(async (node) => {
      const trail = await topologyService.getTrail(node.id);
      return {
        id: node.id,
        name: node.name,
        kind: 'EQUIPMENT' as const,
        context: trail
          .filter((item) => item.id !== node.id)
          .slice(-4)
          .map((item) => item.name)
          .join(' › '),
        ...(node.category ? { category: node.category } : {}),
        ...(node.serialNumber ? { serialNumber: node.serialNumber } : {}),
        ports: node.accessPorts
          .filter(
            (port) =>
              port.lifecycle === 'ACTIVE' &&
              port.portType === 'POWER' &&
              port.direction !== 'OUTPUT',
          )
          .map((port) => {
            const feed = feedOf(port.attributes);
            return {
              id: port.id,
              label: port.name,
              ...(feed ? { feed } : {}),
            };
          }),
      };
    }),
  );

  return (
    <ConnectPowerForm
      source={{
        entityId: sourceDevice.id,
        accessPortId: breaker.accessPortId,
        deviceName: sourceDevice.name,
        shelfId: shelf.id,
        shelfLabel: shelf.label,
        frameId: frame.id,
        frameLabel: frame.label,
        panelId: panel.id,
        panelLabel: panel.label,
        breakerId: breaker.id,
        breakerLabel: breaker.label,
        ...(breaker.capacity === undefined ? {} : { capacity: breaker.capacity }),
      }}
      destinations={destinations}
      returnHref={returnHref}
    />
  );
}
