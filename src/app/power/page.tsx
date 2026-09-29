import Link from 'next/link';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { redirect } from 'next/navigation';
import { PowerPathView, type PowerStage } from '@/components/power/power-path-view';
import { requirePermission } from '@/modules/identity/application/current-session';
import type { PowerEndpoint } from '@/modules/power/domain/entities';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { MetricTile, SectionHeader, StatePanel } from '@/shared/ui/primitives';

export default async function PowerPage({searchParams}: {searchParams: Promise<{entity?:string; breaker?:string; path?:string; feed?:string}>}) {
  const query=await searchParams;
  const auth = await requirePermission('power:read');
  if (!auth.ok) redirect('/login');
  const allPaths = await (await createPowerRepository()).listActive();
  const topology = await createTopologyRepository();
  const service = new TopologyService(topology);
  const related = new Set<string>();
  if (query.entity) {
    const visit = async (id:string, depth=0):Promise<void> => { if (depth>12 || related.has(id)) return; related.add(id); for(const child of await service.listChildren(id)) await visit(child.id,depth+1); };
    await visit(query.entity);
  }
  const paths = allPaths.filter(path => (!query.entity || related.has(path.source.entityId) || related.has(path.target.entityId)) && (!query.breaker || path.source.internal?.breakerHolderId===query.breaker || path.target.internal?.breakerHolderId===query.breaker) && (!query.path || path.id===query.path) && (!query.feed || query.feed==='AB' || path.feed===query.feed));
  async function stagesFor(endpoint: PowerEndpoint): Promise<PowerStage[]> {
    const node = await topology.getById(endpoint.entityId);
    const result: PowerStage[] = [
      {
        id: endpoint.entityId,
        kind: node?.kind ?? 'ENTITY',
        name: node?.name ?? 'Unresolved endpoint',
        href: node ? await service.buildDeepLink(node.id) : '',
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
      result.push({ id: internal.panelId, kind: 'PANEL', name: panel?.label ?? internal.panelId, href: node ? `${await service.buildDeepLink(node.id)}?panel=${encodeURIComponent(internal.panelId)}` : '' });
    if (internal.breakerHolderId)
      result.push({
        id: internal.breakerHolderId,
        kind: breaker?.variant ?? 'BREAKER / HOLDER',
        name: breaker?.label ?? internal.breakerHolderId,
        href: node ? `${await service.buildDeepLink(node.id)}?panel=${encodeURIComponent(internal.panelId ?? '')}&breaker=${encodeURIComponent(internal.breakerHolderId)}` : '',
      });
    return result;
  }
  const views = await Promise.all(
    paths.map(async (path) => {
      const [source, target] = await Promise.all([stagesFor(path.source), stagesFor(path.target)]);
      return { path, stages: [...source, ...target.reverse()] };
    }),
  );
  const primary=views[0];
  const feedA=views.find(item=>item.path.feed==='A');
  const feedB=views.find(item=>item.path.feed==='B');
  const targetName=primary?.stages.at(-1)?.name ?? 'Unresolved target';
  return (
    <main>
      <SectionHeader
        eyebrow="Electrical / distribution"
        title="Power Paths"
        description="Trace configured sources, distribution endpoints and connected inventory."
      />
      <nav className="mk-rack-actions">{['A','B','AB'].map(feed => <Link key={feed} href={`/power?${new URLSearchParams({...query, feed}).toString()}`}>FEED {feed==='AB'?'A+B':feed}</Link>)}</nav>
      <TelemetryLens label="Power path diagnostic" entityIds={[...new Set(paths.flatMap(p=>[p.source.entityId,p.target.entityId]))]} breakerId={query.breaker}/>
      {primary&&<section className="mk-power-diagnostic">
        <div className="mk-power-primary">
          <header><small>SELECTED POWER PATH</small><strong>{primary.path.label ?? primary.path.id}</strong><span>{primary.path.feed ? `FEED ${primary.path.feed}` : 'FEED UNSPECIFIED'}</span></header>
          <div className="mk-power-chain">{primary.stages.map((stage,index)=><div key={`${stage.id}-${index}`} className="mk-power-chain-stage">{stage.href?<Link href={stage.href}><small>{stage.kind.replaceAll('_',' ')}</small><strong>{stage.name}</strong></Link>:<><small>{stage.kind.replaceAll('_',' ')}</small><strong>{stage.name}</strong></>}{index<primary.stages.length-1&&<span>→</span>}</div>)}</div>
          <div className="mk-power-dual">
            <div><small>PATH A</small><strong>{feedA ? 'ACTIVE CONFIGURATION' : 'NOT CONFIGURED'}</strong></div>
            <span>→</span><b>{targetName}</b><span>←</span>
            <div><small>PATH B</small><strong>{feedB ? 'ACTIVE CONFIGURATION' : 'NOT CONFIGURED'}</strong></div>
          </div>
        </div>
        <aside className="mk-inline-inspector mk-power-inspector"><small>PATH INSPECTOR</small><h2>{primary.path.label ?? primary.path.id}</h2><dl><dt>Feed</dt><dd>{primary.path.feed ?? 'Not specified'}</dd><dt>Source</dt><dd>{primary.stages[0]?.name ?? 'Unresolved'}</dd><dt>Destination</dt><dd>{targetName}</dd><dt>Stages</dt><dd>{primary.stages.length}</dd><dt>Feed A</dt><dd>{feedA?'Configured':'Not configured'}</dd><dt>Feed B</dt><dd>{feedB?'Configured':'Not configured'}</dd><dt>Redundancy</dt><dd>{feedA&&feedB?'A + B':'Single feed'}</dd></dl></aside>
      </section>}
      <div className="metric-grid">
        <MetricTile label="Active paths" value={paths.length} detail="Configured relationships" />
        <MetricTile label="Feed A" value={paths.filter((path) => path.feed === 'A').length} />
        <MetricTile label="Feed B" value={paths.filter((path) => path.feed === 'B').length} />
        <MetricTile label="Unspecified feed" value={paths.filter((path) => !path.feed).length} />
      </div>
      {!paths.length ? (
        <StatePanel
          title="No active power paths"
          description="Configured electrical relationships will appear here as source-to-target paths."
        />
      ) : (
        views.map(({ path, stages }) => (
          <PowerPathView
            key={path.id}
            label={path.label ?? path.id}
            feed={path.feed ?? ''}
            stages={stages}
          />
        ))
      )}
    </main>
  );
}
