import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ConnectPowerForm } from '@/components/power/connect-power-form';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { PowerEndpoint } from '@/modules/power/domain/entities';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';
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

  const source = resolved.value;
  const selfHref = await topologyService.buildDeepLink(source.owner.id);
  const returnHref =
    `${selfHref}?panel=${encodeURIComponent(source.panel!.id)}&breaker=${encodeURIComponent(source.breakerHolder.id)}`;

  const activePaths = await (await createPowerRepository()).listActive();
  const existing = activePaths.find((path) => {
    const endpoints = [path.source, path.target];
    return endpoints.some(
      (endpoint) =>
        endpoint.entityId === source.owner.id &&
        endpoint.internal?.breakerHolderId === source.breakerHolder!.id,
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
            <strong>{source.breakerHolder.label}</strong>
            <small>
              {source.owner.name} / {source.panel?.label ?? 'Panel'} / Feed {existing.feed ?? 'unspecified'}
            </small>
          </div>
          <Link
            href={`/power?path=${encodeURIComponent(existing.id)}&breaker=${encodeURIComponent(source.breakerHolder.id)}${existing.feed ? `&feed=${existing.feed}` : ''}`}
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
  ].filter((node) => node.lifecycle === 'ACTIVE' && node.id !== source.owner.id);

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
        entityId: source.owner.id,
        deviceName: source.owner.name,
        shelfId: source.shelf!.id,
        shelfLabel: source.shelf!.label,
        frameId: source.frame!.id,
        frameLabel: source.frame!.label,
        panelId: source.panel!.id,
        panelLabel: source.panel!.label,
        breakerId: source.breakerHolder.id,
        breakerLabel: source.breakerHolder.label,
        ...(source.breakerHolder.capacity === undefined
          ? {}
          : { capacity: source.breakerHolder.capacity }),
      }}
      destinations={destinations}
      returnHref={returnHref}
    />
  );
}
