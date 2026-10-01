import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ConnectPowerForm } from '@/components/power/connect-power-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { PowerEndpoint } from '@/modules/power/domain/entities';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const dynamic = 'force-dynamic';

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
  const owner = await topology.getById(query.entity);
  const sourceEndpoint: PowerEndpoint = {
    entityId: query.entity,
    internal: {
      shelfId: query.shelf,
      frameId: query.frame,
      panelId: query.panel,
      breakerHolderId: query.breaker,
    },
  };
  const resolved = resolvePowerEndpoint(owner, sourceEndpoint);
  if (!resolved.ok || !resolved.value.breakerHolder || resolved.value.breakerHolder.variant !== 'BREAKER') {
    notFound();
  }

  const { owner: sourceOwner, shelf, frame, panel, breakerHolder } = resolved.value;
  if (!shelf || !frame || !panel || !breakerHolder || breakerHolder.variant !== 'BREAKER') {
    notFound();
  }

  const selfHref = await topologyService.buildDeepLink(sourceOwner.id);
  const returnHref =
    `${selfHref}?panel=${encodeURIComponent(panel.id)}&breaker=${encodeURIComponent(breakerHolder.id)}`;

  const activePaths = await (await createPowerRepository()).listActive();
  const existing = activePaths.find((path) => {
    const endpoints = [path.source, path.target];
    return endpoints.some(
      (endpoint) =>
        endpoint.entityId === sourceOwner.id &&
        endpoint.internal?.breakerHolderId === breakerHolder.id,
    );
  });

  if (existing) {
    return (
      <main className="power-connect-page">
        <header className="power-connect-header">
          <div>
            <p>POWER / COMMISSIONING</p>
            <h1>Breaker already connected</h1>
            <span>This breaker already has an active PowerPath. Trace or review it before changing the physical model.</span>
          </div>
          <Link href={returnHref}>← Back to breaker</Link>
        </header>
        <section className="power-connect-existing">
          <span>✓</span>
          <div>
            <strong>{breakerHolder.label}</strong>
            <small>
              {sourceOwner.name} / {panel.label} / Feed {existing.feed ?? 'unspecified'}
            </small>
          </div>
          <Link
            href={`/power?path=${encodeURIComponent(existing.id)}&breaker=${encodeURIComponent(breakerHolder.id)}${existing.feed ? `&feed=${existing.feed}` : ''}`}
          >
            TRACE PATH →
          </Link>
        </section>
      </main>
    );
  }

  const candidates = [
    ...(await topology.listByKind('DEVICE')),
    ...(await topology.listByKind('EQUIPMENT')),
  ].filter(
    (node): node is Extract<TopologyNode, { kind: 'DEVICE' | 'EQUIPMENT' }> =>
      (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') &&
      node.lifecycle === 'ACTIVE' &&
      node.id !== sourceOwner.id,
  );

  const destinations = await Promise.all(
    candidates.map(async (node) => {
      const trail = await topologyService.getTrail(node.id);
      return {
        id: node.id,
        name: node.name,
        kind: node.kind as 'DEVICE' | 'EQUIPMENT',
        context: trail
          .filter((item) => item.id !== node.id)
          .slice(-4)
          .map((item) => item.name)
          .join(' › '),
        ...(node.category ? { category: node.category } : {}),
        ...(node.serialNumber ? { serialNumber: node.serialNumber } : {}),
      };
    }),
  );

  return (
    <ConnectPowerForm
      source={{
        entityId: sourceOwner.id,
        deviceName: sourceOwner.name,
        shelfId: shelf.id,
        shelfLabel: shelf.label,
        frameId: frame.id,
        frameLabel: frame.label,
        panelId: panel.id,
        panelLabel: panel.label,
        breakerId: breakerHolder.id,
        breakerLabel: breakerHolder.label,
        ...(breakerHolder.capacity === undefined
          ? {}
          : { capacity: breakerHolder.capacity }),
      }}
      destinations={destinations}
      returnHref={returnHref}
    />
  );
}
