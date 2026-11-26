import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import {
  ConnectEquipmentPowerForm,
  type CommissioningPort,
} from '@/components/power/connect-equipment-power-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import { PowerTargetCatalogService } from '@/modules/power/application/power-target-catalog-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createPowerTargetCatalogRepository } from '@/modules/power/infrastructure/power-target-catalog-repository-factory';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

function feedOf(value: unknown): 'A' | 'B' | undefined {
  return value === 'A' || value === 'B' ? value : undefined;
}

function panelFeed(value: string | undefined): 'A' | 'B' | undefined {
  const normalized = value?.trim().toUpperCase() ?? '';
  if (/^A(?:\d|\b|[-_ ])/.test(normalized)) return 'A';
  if (/^B(?:\d|\b|[-_ ])/.test(normalized)) return 'B';
  return undefined;
}

export default async function ConnectEquipmentPowerPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ source?: string; target?: string }>;
}>) {
  const auth = await requirePermission('power:write');
  if (!auth.ok) redirect('/workspace');

  const t = await getTranslations('pages.connectEquipment');
  const params = await searchParams;
  const topology = await createTopologyRepository();
  const power = await createPowerRepository();
  const targetCatalogRepository = await createPowerTargetCatalogRepository();
  const [nodes, activePaths] = await Promise.all([
    topology.listByKind('EQUIPMENT'),
    power.listActive(),
  ]);
  const catalogTargets = await new PowerTargetCatalogService(
    topology,
    power,
    targetCatalogRepository,
  ).list();
  const equipment = nodes.filter(
    (node): node is EquipmentNode => node.kind === 'EQUIPMENT' && node.lifecycle === 'ACTIVE',
  );
  const equipmentById = new Map(equipment.map((node) => [node.id, node] as const));
  const pathByPort = new Map(
    activePaths.flatMap(
      (path) =>
        [
          [path.sourceAccessPortId, path],
          [path.targetAccessPortId, path],
        ] as const,
    ),
  );
  const portNames = new Map(
    equipment.flatMap((node) =>
      node.accessPorts.map((port) => [port.id, `${node.name} / ${port.name}`] as const),
    ),
  );
  const sources: CommissioningPort[] = [];
  const targets: CommissioningPort[] = [];

  for (const node of equipment) {
    for (const port of node.accessPorts) {
      if (port.lifecycle !== 'ACTIVE' || port.portType !== 'POWER') continue;
      const parentPanel =
        node.equipmentType === 'CIRCUIT_BREAKER' && node.parentEquipmentId
          ? equipmentById.get(node.parentEquipmentId)
          : undefined;
      const fixedFeed = feedOf(port.attributes?.feed) ?? panelFeed(parentPanel?.name);
      const existing = pathByPort.get(port.id);
      const peerId = existing
        ? existing.sourceAccessPortId === port.id
          ? existing.targetAccessPortId
          : existing.sourceAccessPortId
        : null;
      const item: CommissioningPort = {
        id: port.id,
        name: port.name,
        equipmentId: node.id,
        equipmentName: node.name,
        deviceId: node.deviceId,
        direction: port.direction ?? 'BIDIRECTIONAL',
        ...(fixedFeed ? { feed: fixedFeed } : {}),
        ...(existing
          ? {
              connected: true,
              connectionLabel: (peerId && portNames.get(peerId)) || peerId || t('unknownPort'),
              pathId: existing.id,
            }
          : {}),
      };
      if (port.direction !== 'INPUT') sources.push(item);
      if (port.direction !== 'OUTPUT') targets.push(item);
    }
  }

  sources.sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));
  targets.sort((a, b) => a.equipmentName.localeCompare(b.equipmentName));

  const selectedSource = sources.find((port) => port.id === params.source);
  const selectedTarget = targets.find((port) => port.id === params.target);
  const origin = selectedSource ?? selectedTarget;
  const returnHref = origin ? `/device/${encodeURIComponent(origin.equipmentId)}` : '/power';

  return (
    <>
      <ConnectEquipmentPowerForm
        sources={sources}
        targets={targets}
        catalogTargets={catalogTargets}
        {...(selectedSource ? { selectedSourceId: selectedSource.id } : {})}
        {...(selectedTarget ? { selectedTargetId: selectedTarget.id } : {})}
        returnHref={returnHref}
      />
      {!sources.length ? (
        <div className="power-port-connect-empty">
          {t('requireSource')} <Link href={returnHref}>{t('return')}</Link> {t('configureSource')}
        </div>
      ) : null}
    </>
  );
}
