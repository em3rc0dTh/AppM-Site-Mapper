import Link from 'next/link';
import { redirect } from 'next/navigation';

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

function iconFor(kind: string) {
  return kind === 'UTILITY'
    ? '♜'
    : kind === 'DEVICE'
      ? '▥'
      : kind === 'PANEL'
        ? '▤'
        : kind === 'BREAKER'
          ? '▯'
          : '♜';
}

function PathRow({ stages, dim = false }: { stages: readonly Stage[]; dim?: boolean }) {
  return (
    <div className={`zip-power-row ${dim ? 'is-dim' : ''}`}>
      {stages.map((stage, index) => (
        <div key={`${stage.id}-${index}`} className="zip-power-node-wrap">
          {stage.href ? (
            <Link className="zip-power-node" href={stage.href}>
              <b>{iconFor(stage.kind)}</b>
              <span>{stage.name}</span>
            </Link>
          ) : (
            <div className="zip-power-node">
              <b>{iconFor(stage.kind)}</b>
              <span>{stage.name}</span>
            </div>
          )}
          {index < stages.length - 1 && <i>→</i>}
        </div>
      ))}
    </div>
  );
}

export default async function PowerPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; breaker?: string; path?: string; feed?: string }>;
}) {
  const query = await searchParams;
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');

  const repository = await createPowerRepository();
  const topology = await createTopologyRepository();
  const service = new TopologyService(topology);
  const allPaths = await repository.listActive();

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
        name: node?.name ?? 'Unresolved',
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
    if (internal.panelId)
      result.push({ id: internal.panelId, kind: 'PANEL', name: panel?.label ?? internal.panelId });
    if (internal.breakerHolderId)
      result.push({
        id: internal.breakerHolderId,
        kind: 'BREAKER',
        name: breaker?.label ?? internal.breakerHolderId,
      });
    return result;
  }

  const views = await Promise.all(
    paths.map(async (path) => {
      const [source, target] = await Promise.all([stagesFor(path.source), stagesFor(path.target)]);
      return { path, source, target };
    }),
  );
  const feedA = views.find((entry) => entry.path.feed === 'A') ?? views[0];
  const feedB = views.find((entry) => entry.path.feed === 'B');
  const primary = feedA ?? feedB;
  const destination = primary?.target[0];
  const source = primary?.source[0];
  const utilityStage: Stage = { id: 'utility-source', kind: 'UTILITY', name: 'UTILITY / SOURCE' };

  return (
    <main className="zip-power-page">
      <nav className="breadcrumbs zip-power-breadcrumbs">
        {destination?.href ? (
          <Link href={destination.href}>← {destination.name}</Link>
        ) : (
          <span>POWER</span>
        )}
        <span className="zip-breadcrumb-divider" />
        <strong>POWER PATH</strong>
      </nav>
      <div className="zip-power-top-controls" aria-label="Power path status">
        <Link href="/power?feed=AB">
          A+B <span>⌄</span>
        </Link>
        <strong>
          <i /> HEALTHY
        </strong>
      </div>
      <div className="zip-power-layout">
        <aside className="zip-power-tree">
          <header>
            POWER TREE <span>⌄</span>
          </header>
          <strong>{destination?.name ?? 'DESTINATION'}</strong>
          {views.map(({ path, source, target }) => (
            <div className="zip-power-tree-feed" key={path.id}>
              <b>⚡ Feed {path.feed ?? '—'}</b>
              <span>└ {source[0]?.name ?? 'Source'}</span>
              {source.slice(1).map((stage) => (
                <span key={stage.id}> &nbsp;&nbsp;└ {stage.name}</span>
              ))}
              <small>→ {target[0]?.name ?? 'Destination'}</small>
            </div>
          ))}
        </aside>

        <section className="zip-power-canvas">
          <header>
            <h1>POWER CANVAS</h1>
            <span>⌗</span>
          </header>
          {primary ? (
            <>
              <article className="zip-power-box">
                <h2>PATH {primary.path.feed ?? 'A'} (PRIMARY)</h2>
                <PathRow stages={[utilityStage, ...primary.source, ...primary.target]} />
              </article>
              <article className="zip-power-box zip-power-dual-box">
                <h2>DUAL FEED OVERVIEW</h2>
                <div className="zip-power-dual-grid">
                  {feedA && (
                    <>
                      <span className="zip-feed-label">Feed A</span>
                      <PathRow stages={[utilityStage, ...feedA.source, ...feedA.target]} />
                    </>
                  )}
                  {feedB && (
                    <>
                      <span className="zip-feed-label is-b">Feed B</span>
                      <PathRow stages={[utilityStage, ...feedB.source, ...feedB.target]} dim />
                    </>
                  )}
                  {!feedB && <div className="zip-power-missing">Feed B not configured</div>}
                </div>
              </article>
            </>
          ) : (
            <div className="zip-power-empty">No active power paths for this selection.</div>
          )}
        </section>

        <aside className="zip-power-inspector">
          <header>
            INSPECTOR <span>⌄</span>
          </header>
          <div className="zip-power-inspector-id">
            <b>▤</b>
            <strong>PATH {primary?.path.feed ?? 'A'}</strong>
          </div>
          <dl>
            <dt>Source</dt>
            <dd>{source?.name ?? '—'}</dd>
            <dt>Panel</dt>
            <dd>{primary?.source.find((item) => item.kind === 'PANEL')?.name ?? '—'}</dd>
            <dt>Breaker</dt>
            <dd>{primary?.source.find((item) => item.kind === 'BREAKER')?.name ?? '—'}</dd>
            <dt>Destination</dt>
            <dd>{destination?.name ?? '—'}</dd>
            <dt>Valid</dt>
            <dd className="is-good">✓</dd>
            <dt>Redundant</dt>
            <dd className="is-good">{feedA && feedB ? '✓' : '—'}</dd>
          </dl>
          {source?.href && (
            <Link className="zip-outline-action" href={source.href}>
              ↗ OPEN BDFB
            </Link>
          )}
        </aside>
      </div>
      <footer className="zip-power-footer">
        <span>
          ⚡ FEED A <b className="is-good">● ACTIVE</b>
        </span>
        <span>
          ⚡ FEED B <b className={feedB ? 'is-good' : ''}>● {feedB ? 'ACTIVE' : 'UNAVAILABLE'}</b>
        </span>
        <span>
          REDUNDANCY <b className={feedA && feedB ? 'is-good' : ''}>{feedA && feedB ? '✓' : '—'}</b>
        </span>
        <div />
        <Link href="/power?feed=AB">SHOW BOTH</Link>
      </footer>
    </main>
  );
}
