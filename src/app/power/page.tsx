import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { FullPowerTraceModal } from '@/components/power/full-power-trace-modal';
import { PowerCanvasRoute } from '@/components/power/power-canvas-route';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { requirePermission } from '@/modules/identity/application/current-session';
import { resolvePowerEndpoint } from '@/modules/power/domain/endpoint-validation';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

interface Stage {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly href?: string;
}

function feedFromStages(stages: readonly Stage[], fallback?: 'A' | 'B'): 'A' | 'B' | undefined {
  const names = stages
    .filter((stage) => stage.kind === 'PANEL' || stage.kind === 'FRAME' || stage.kind === 'SHELF')
    .map((stage) => stage.name);
  for (const name of names) {
    const normalized = name.trim().toUpperCase();
    if (/^A(?:\d|\b|[\s_-])/.test(normalized) || /FEED\s*A\b/.test(normalized)) return 'A';
    if (/^B(?:\d|\b|[\s_-])/.test(normalized) || /FEED\s*B\b/.test(normalized)) return 'B';
  }
  return fallback;
}

export default async function PowerPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; breaker?: string; path?: string; feed?: string }>;
}) {
  const query = await searchParams;
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');

  const powerRepo = await createPowerRepository();
  const topology = await createTopologyRepository();
  const service = new TopologyService(topology);
  const allPaths = await powerRepo.listActive();

  const selectedEntity = query.entity ? await topology.getById(query.entity) : null;
  const allEquipment = (await topology.listByKind('EQUIPMENT')).filter(
    (node): node is EquipmentNode => node.kind === 'EQUIPMENT' && node.lifecycle === 'ACTIVE',
  );
  const byEquipmentId = new Map(allEquipment.map((item) => [item.id, item]));

  const inSubtree = (candidate: EquipmentNode, rootId: string): boolean => {
    let current: EquipmentNode | undefined = candidate;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.id === rootId) return true;
      visited.add(current.id);
      current = current.parentEquipmentId
        ? byEquipmentId.get(current.parentEquipmentId)
        : undefined;
    }
    return false;
  };

  const contextEquipment =
    selectedEntity?.kind === 'DEVICE'
      ? allEquipment.filter((item) => item.deviceId === selectedEntity.id)
      : selectedEntity?.kind === 'EQUIPMENT'
        ? allEquipment.filter((item) => inSubtree(item, selectedEntity.id))
        : [];
  const contextPortIds = new Set(
    contextEquipment.flatMap((item) => item.accessPorts.map((port) => port.id)),
  );

  const enriched = await Promise.all(
    allPaths.map(async (path) => ({
      path,
      source: await resolvePowerEndpoint(topology, path.sourceAccessPortId),
      target: await resolvePowerEndpoint(topology, path.targetAccessPortId),
    })),
  );

  const filtered = enriched.filter(({ path, source, target }) => {
    if (
      query.entity &&
      !contextPortIds.has(path.sourceAccessPortId) &&
      !contextPortIds.has(path.targetAccessPortId)
    ) {
      return false;
    }
    if (
      query.breaker &&
      source?.equipment.id !== query.breaker &&
      target?.equipment.id !== query.breaker
    ) {
      return false;
    }
    if (query.path && path.id !== query.path) return false;
    if (!query.path && query.feed && query.feed !== 'AB' && path.feed !== query.feed) return false;
    return true;
  });

  async function stagesFor(
    resolved: Awaited<ReturnType<typeof resolvePowerEndpoint>>,
    fallbackId: string,
  ): Promise<Stage[]> {
    if (!resolved) return [{ id: fallbackId, kind: 'ACCESS_PORT', name: fallbackId }];

    const trail: EquipmentNode[] = [];
    let current: EquipmentNode | undefined = resolved.equipment;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      trail.push(current);
      current = current.parentEquipmentId
        ? byEquipmentId.get(current.parentEquipmentId)
        : undefined;
    }

    const device = await topology.getById(resolved.equipment.deviceId);
    return [
      ...(device?.kind === 'DEVICE'
        ? [
            {
              id: device.id,
              kind: 'DEVICE',
              name: device.name,
              href: await service.buildDeepLink(device.id),
            },
          ]
        : []),
      ...trail.reverse().map((equipment) => ({
        id: equipment.id,
        kind: equipment.equipmentType,
        name: equipment.name,
        href: `/device/${equipment.id}`,
      })),
      { id: resolved.port.id, kind: 'ACCESS_PORT', name: resolved.port.name },
    ];
  }

  const views = await Promise.all(
    filtered.map(async ({ path, source, target }) => {
      const [sourceStages, targetStages] = await Promise.all([
        stagesFor(source, path.sourceAccessPortId),
        stagesFor(target, path.targetAccessPortId),
      ]);
      return {
        path,
        source,
        target,
        // The persisted PowerPath feed is authoritative; labels are hints only.
        feed: path.feed ?? feedFromStages(sourceStages),
        sourceStages,
        targetStages,
      };
    }),
  );

  const primary = views[0];
  const feedA = views.find((item) => item.feed === 'A');
  const feedB = views.find((item) => item.feed === 'B');
  const targetName =
    primary?.target?.equipment.name ?? primary?.targetStages.at(-2)?.name ?? 'Unresolved target';
  const breadcrumbs = selectedEntity ? await service.getTrail(selectedEntity.id) : [];
  const traceEntityId = primary?.target?.equipment.deviceId ?? selectedEntity?.id;
  const telemetryEntityIds = [
    ...new Set(
      views.flatMap((item) => [
        ...(item.source ? [item.source.equipment.deviceId] : []),
        ...(item.target ? [item.target.equipment.deviceId] : []),
      ]),
    ),
  ];

  const t = await getTranslations('pages.power');
  const renderFeedSummary = (view: (typeof views)[number]) => (
    <div className="zip-power-feed-summary">
      <strong>
        {t('feed', { side: view.feed ?? '—' })} · {t('configured')}
      </strong>
      <span>
        {view.source?.equipment.name ?? view.path.sourceAccessPortId} /{' '}
        {view.source?.port.name ?? 'POWER OUTPUT'}
      </span>
      <b aria-hidden="true">→</b>
      <span>
        {view.target?.equipment.name ?? view.path.targetAccessPortId} /{' '}
        {view.target?.port.name ?? 'POWER INPUT'}
      </span>
    </div>
  );

  return (
    <main className="zip-power-page">
      <nav className="breadcrumbs zip-power-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/network">← {t('network')}</Link>
        <span className="zip-breadcrumb-divider" />
        <strong>{t('powerPath')}</strong>
      </nav>

      <div className="zip-power-top-controls">
        <Link
          href={`/power?${new URLSearchParams({ ...query, feed: query.feed ?? 'AB' }).toString()}`}
        >
          {query.feed === 'A' ? 'FEED A' : query.feed === 'B' ? 'FEED B' : 'A+B'} <b>⌄</b>
        </Link>
        <strong>
          <i /> {primary ? t('configured') : t('noPath')}
        </strong>
      </div>

      <div className="zip-power-layout">
        <aside className="zip-power-tree">
          <header>
            {t('tree')} <span>⌄</span>
          </header>
          <strong>{selectedEntity?.name ?? t('canvas')}</strong>
          {breadcrumbs.map((node) => (
            <div className="zip-power-tree-feed" key={node.id}>
              <b>{node.name}</b>
              <span>{node.kind.replaceAll('_', ' ')}</span>
              <small>{node.id}</small>
            </div>
          ))}
          {!breadcrumbs.length ? (
            <>
              <div className="zip-power-tree-feed">
                <b>Feed A</b>
                <span>{t('primary')}</span>
                <small>{feedA ? t('configuredLower') : t('notConfigured')}</small>
              </div>
              <div className="zip-power-tree-feed">
                <b>Feed B</b>
                <span>{t('secondary')}</span>
                <small>{feedB ? t('configuredLower') : t('notConfigured')}</small>
              </div>
            </>
          ) : null}
        </aside>

        <section className="zip-power-canvas">
          <header>
            <h1>{t('canvas')}</h1>
            <span>{t('pathPrimary', { side: primary?.feed ?? 'A' })}</span>
          </header>

          {primary ? (
            <>
              <section className="zip-power-box">
                <h2>{t('pathPrimary', { side: primary.feed ?? 'A' })}</h2>
                <PowerCanvasRoute
                  sourceStages={primary.sourceStages}
                  targetStages={primary.targetStages}
                  sourceEquipmentName={primary.source?.equipment.name ?? t('sourceMissing')}
                  targetEquipmentName={primary.target?.equipment.name ?? t('destinationMissing')}
                  sourcePortName={primary.source?.port.name ?? primary.path.sourceAccessPortId}
                  targetPortName={primary.target?.port.name ?? primary.path.targetAccessPortId}
                  {...(primary.feed ? { feed: primary.feed } : {})}
                />
              </section>
              <section className="zip-power-box zip-power-dual-box">
                <h2>{t('dual')}</h2>
                <div className="zip-power-dual-grid">
                  {feedA ? (
                    renderFeedSummary(feedA)
                  ) : (
                    <div className="zip-power-missing">{t('feedUnconfigured', { side: 'A' })}</div>
                  )}
                  {feedB ? (
                    renderFeedSummary(feedB)
                  ) : (
                    <div className="zip-power-missing">{t('feedUnconfigured', { side: 'B' })}</div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="zip-power-empty">{t('noActive')}</div>
          )}
        </section>

        <aside className="zip-power-inspector">
          <header>
            {t('inspector')} <span>⌄</span>
          </header>
          <div className="zip-power-inspector-id">
            <b>▤</b>
            <strong>{targetName}</strong>
          </div>
          <dl>
            <dt>{t('status')}</dt>
            <dd className="is-good">● CONFIGURED</dd>
            <dt>{t('feedLabel')}</dt>
            <dd>{primary?.feed ?? '—'}</dd>
            <dt>{t('source')}</dt>
            <dd>{primary?.source?.equipment.name ?? primary?.sourceStages.at(-2)?.name ?? '—'}</dd>
            <dt>{t('destination')}</dt>
            <dd>{targetName}</dd>
            <dt>Feed A</dt>
            <dd>{feedA ? t('configuredLower') : t('notConfigured')}</dd>
            <dt>Feed B</dt>
            <dd>{feedB ? t('configuredLower') : t('notConfigured')}</dd>
            <dt>{t('redundancy')}</dt>
            <dd>{feedA && feedB ? 'A + B' : t('single')}</dd>
          </dl>
          {selectedEntity ? (
            <Link
              className="zip-outline-action"
              href={await service.buildDeepLink(selectedEntity.id)}
            >
              {t('openDevice')}
            </Link>
          ) : null}
          {primary && traceEntityId ? (
            <FullPowerTraceModal
              entityId={traceEntityId}
              selectedPathId={primary.path.id}
              label={t('fullTrace')}
            />
          ) : null}
          <TelemetryLens
            label={t('diagnostic')}
            entityIds={telemetryEntityIds}
            breakerId={query.breaker}
          />
        </aside>
      </div>

      <footer className="zip-power-footer">
        <span>
          FEED A{' '}
          <b className={feedA ? 'is-good' : ''}>
            {feedA ? '● ' + t('configured') : '○ ' + t('notConfiguredFull')}
          </b>
        </span>
        <span>
          FEED B{' '}
          <b className={feedB ? 'is-good' : ''}>
            {feedB ? '● ' + t('configured') : '○ ' + t('notConfiguredFull')}
          </b>
        </span>
        <span>
          {t('redundancy')} <b>{feedA && feedB ? '✓' : '—'}</b>
        </span>
        <div />
        {selectedEntity ? (
          <Link href={await service.buildDeepLink(selectedEntity.id)}>{t('showRoom')}</Link>
        ) : null}
      </footer>
    </main>
  );
}
