import Link from 'next/link';
import { redirect } from 'next/navigation';

import { FullPowerTraceModal } from '@/components/power/full-power-trace-modal';
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

function glyph(kind: string) {
  if (kind === 'PANEL') return '▥';
  if (kind.includes('BREAKER')) return '▣';
  if (kind.includes('DEVICE')) return '▤';
  if (kind.includes('SHELF') || kind.includes('FRAME')) return '□';
  if (kind === 'ACCESS_PORT') return '◉';
  return 'ϟ';
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
        feed: feedFromStages(sourceStages, path.feed),
        stages: [...sourceStages, ...targetStages.reverse()],
      };
    }),
  );

  const primary = views[0];
  const feedA = views.find((item) => item.feed === 'A');
  const feedB = views.find((item) => item.feed === 'B');
  const targetName =
    primary?.target?.equipment.name ?? primary?.stages.at(-1)?.name ?? 'Unresolved target';
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

  const renderRow = (stages: readonly Stage[], dim = false) => (
    <div className={`zip-power-row ${dim ? 'is-dim' : ''}`}>
      {stages.slice(0, 6).map((stage, index) => (
        <div className="zip-power-node-wrap" key={`${stage.id}-${index}`}>
          {stage.href ? (
            <Link className="zip-power-node" href={stage.href}>
              <b>{glyph(stage.kind)}</b>
              <span>{stage.name}</span>
            </Link>
          ) : (
            <span className="zip-power-node">
              <b>{glyph(stage.kind)}</b>
              <span>{stage.name}</span>
            </span>
          )}
          {index < Math.min(stages.length, 6) - 1 ? <i>→</i> : null}
        </div>
      ))}
    </div>
  );

  return (
    <main className="zip-power-page">
      <nav className="breadcrumbs zip-power-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/network">← NETWORK</Link>
        <span className="zip-breadcrumb-divider" />
        <strong>POWER PATH</strong>
      </nav>

      <div className="zip-power-top-controls">
        <Link
          href={`/power?${new URLSearchParams({ ...query, feed: query.feed ?? 'AB' }).toString()}`}
        >
          {query.feed === 'A' ? 'FEED A' : query.feed === 'B' ? 'FEED B' : 'A+B'} <b>⌄</b>
        </Link>
        <strong>
          <i /> {primary ? 'CONFIGURED' : 'NO PATH'}
        </strong>
      </div>

      <div className="zip-power-layout">
        <aside className="zip-power-tree">
          <header>
            POWER TREE <span>⌄</span>
          </header>
          <strong>{selectedEntity?.name ?? 'POWER CANVAS'}</strong>
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
                <span>Primary path</span>
                <small>{feedA ? 'Configured' : 'Not configured'}</small>
              </div>
              <div className="zip-power-tree-feed">
                <b>Feed B</b>
                <span>Secondary path</span>
                <small>{feedB ? 'Configured' : 'Not configured'}</small>
              </div>
            </>
          ) : null}
        </aside>

        <section className="zip-power-canvas">
          <header>
            <h1>POWER CANVAS</h1>
            <span>PATH {primary?.feed ?? 'A'} (PRIMARY)</span>
          </header>

          {primary ? (
            <>
              <section className="zip-power-box">
                <h2>PATH {primary.feed ?? 'A'} (PRIMARY)</h2>
                {renderRow(primary.stages)}
              </section>
              <section className="zip-power-box zip-power-dual-box">
                <h2>DUAL FEED OVERVIEW</h2>
                <div className="zip-power-dual-grid">
                  <span className="zip-feed-label">FEED A</span>
                  {feedA ? (
                    renderRow(feedA.stages)
                  ) : (
                    <div className="zip-power-missing">Feed A not configured</div>
                  )}
                  <span className="zip-feed-label is-b">FEED B</span>
                  {feedB ? (
                    renderRow(feedB.stages, true)
                  ) : (
                    <div className="zip-power-missing">Feed B not configured</div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="zip-power-empty">No active power path matches this context.</div>
          )}
        </section>

        <aside className="zip-power-inspector">
          <header>
            INSPECTOR <span>⌄</span>
          </header>
          <div className="zip-power-inspector-id">
            <b>▤</b>
            <strong>{targetName}</strong>
          </div>
          <dl>
            <dt>Status</dt>
            <dd className="is-good">● CONFIGURED</dd>
            <dt>Feed</dt>
            <dd>{primary?.feed ?? '—'}</dd>
            <dt>Source</dt>
            <dd>{primary?.source?.equipment.name ?? primary?.stages[0]?.name ?? '—'}</dd>
            <dt>Destination</dt>
            <dd>{targetName}</dd>
            <dt>Feed A</dt>
            <dd>{feedA ? 'Configured' : 'Not configured'}</dd>
            <dt>Feed B</dt>
            <dd>{feedB ? 'Configured' : 'Not configured'}</dd>
            <dt>Redundancy</dt>
            <dd>{feedA && feedB ? 'A + B' : 'Single feed'}</dd>
          </dl>
          {selectedEntity ? (
            <Link
              className="zip-outline-action"
              href={await service.buildDeepLink(selectedEntity.id)}
            >
              OPEN DEVICE
            </Link>
          ) : null}
          {primary && traceEntityId ? (
            <FullPowerTraceModal
              entityId={traceEntityId}
              selectedPathId={primary.path.id}
              label="ϟ FULL POWER TRACE"
            />
          ) : null}
          <TelemetryLens
            label="Power path diagnostic"
            entityIds={telemetryEntityIds}
            breakerId={query.breaker}
          />
        </aside>
      </div>

      <footer className="zip-power-footer">
        <span>
          FEED A <b className={feedA ? 'is-good' : ''}>{feedA ? '● ACTIVE' : '○ NOT CONFIGURED'}</b>
        </span>
        <span>
          FEED B <b className={feedB ? 'is-good' : ''}>{feedB ? '● ACTIVE' : '○ NOT CONFIGURED'}</b>
        </span>
        <span>
          REDUNDANCY <b>{feedA && feedB ? '✓' : '—'}</b>
        </span>
        <div />
        {selectedEntity ? (
          <Link href={await service.buildDeepLink(selectedEntity.id)}>SHOW ROOM</Link>
        ) : null}
      </footer>
    </main>
  );
}
