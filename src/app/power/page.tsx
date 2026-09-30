import Link from 'next/link';
import { redirect } from 'next/navigation';

import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { PowerEndpoint } from '@/modules/power/domain/entities';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

interface Stage {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly href?: string;
}

function glyph(kind: string) {
  if (kind === 'PANEL') return '▥';
  if (kind.includes('BREAKER') || kind.includes('HOLDER')) return '▣';
  if (kind.includes('DEVICE')) return '▤';
  if (kind.includes('SHELF') || kind.includes('FRAME')) return '□';
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
  const allPaths = await powerRepo.listActive();
  const topology = await createTopologyRepository();
  const service = new TopologyService(topology);
  const related = new Set<string>();

  if (query.entity) {
    const visit = async (id: string, depth = 0): Promise<void> => {
      if (depth > 12 || related.has(id)) return;
      related.add(id);
      for (const child of await service.listChildren(id)) await visit(child.id, depth + 1);
    };
    await visit(query.entity);
  }

  const paths = allPaths.filter(
    (path) =>
      (!query.entity || related.has(path.source.entityId) || related.has(path.target.entityId)) &&
      (!query.breaker ||
        path.source.internal?.breakerHolderId === query.breaker ||
        path.target.internal?.breakerHolderId === query.breaker) &&
      (!query.path || path.id === query.path) &&
      (!query.feed || query.feed === 'AB' || path.feed === query.feed),
  );

  async function stagesFor(endpoint: PowerEndpoint): Promise<Stage[]> {
    const node = await topology.getById(endpoint.entityId);
    const result: Stage[] = [
      {
        id: endpoint.entityId,
        kind: node?.kind ?? 'ENTITY',
        name: node?.name ?? 'Unresolved endpoint',
        ...(node ? { href: await service.buildDeepLink(node.id) } : {}),
      },
    ];
    const internal = endpoint.internal;
    if (!internal) return result;

    const shelf =
      node?.kind === 'DEVICE'
        ? node.bdfb?.shelves.find((item) => item.id === internal.shelfId)
        : undefined;
    const frame = shelf?.frames.find((item) => item.id === internal.frameId);
    const panel = frame?.panels.find((item) => item.id === internal.panelId);
    const breaker = panel?.endpoints.find((item) => item.id === internal.breakerHolderId);

    if (internal.shelfId)
      result.push({ id: internal.shelfId, kind: 'SHELF', name: shelf?.label ?? internal.shelfId });
    if (internal.frameId)
      result.push({ id: internal.frameId, kind: 'FRAME', name: frame?.label ?? internal.frameId });
    if (internal.panelId)
      result.push({
        id: internal.panelId,
        kind: 'PANEL',
        name: panel?.label ?? internal.panelId,
        ...(node
          ? {
              href: `${await service.buildDeepLink(node.id)}?panel=${encodeURIComponent(internal.panelId)}`,
            }
          : {}),
      });
    if (internal.breakerHolderId)
      result.push({
        id: internal.breakerHolderId,
        kind: breaker?.variant ?? 'BREAKER / HOLDER',
        name: breaker?.label ?? internal.breakerHolderId,
        ...(node
          ? {
              href: `${await service.buildDeepLink(node.id)}?panel=${encodeURIComponent(internal.panelId ?? '')}&breaker=${encodeURIComponent(internal.breakerHolderId)}`,
            }
          : {}),
      });

    return result;
  }

  const views = await Promise.all(
    paths.map(async (path) => {
      const [source, target] = await Promise.all([stagesFor(path.source), stagesFor(path.target)]);
      return { path, stages: [...source, ...target.reverse()] };
    }),
  );

  const primary = views[0];
  const feedA = views.find((item) => item.path.feed === 'A');
  const feedB = views.find((item) => item.path.feed === 'B');
  const targetName = primary?.stages.at(-1)?.name ?? 'Unresolved target';
  const selectedEntity = query.entity ? await topology.getById(query.entity) : null;
  const breadcrumbs = selectedEntity ? await service.getTrail(selectedEntity.id) : [];

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
            <span>PATH {primary?.path.feed ?? 'A'} (PRIMARY)</span>
          </header>

          {primary ? (
            <>
              <section className="zip-power-box">
                <h2>PATH {primary.path.feed ?? 'A'} (PRIMARY)</h2>
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
            <dd>{primary?.path.feed ?? '—'}</dd>
            <dt>Source</dt>
            <dd>{primary?.stages[0]?.name ?? '—'}</dd>
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
          <TelemetryLens
            label="Power path diagnostic"
            entityIds={[
              ...new Set(paths.flatMap((path) => [path.source.entityId, path.target.entityId])),
            ]}
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
