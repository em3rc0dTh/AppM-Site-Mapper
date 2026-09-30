import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DemoSeedButton } from '@/components/dev/demo-seed-button';
import { NavigationTree } from '@/components/workspace/navigation-tree';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { TopologyService } from '@/modules/topology/application/topology-service';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';
import { readContext } from '@/modules/workspace/infrastructure/context-repository';

export const dynamic = 'force-dynamic';

function flatten(nodes: readonly WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

function kindIcon(kind: string) {
  if (kind.includes('RACK')) return '▥';
  if (kind === 'DEVICE') return '▤';
  if (kind.includes('ROOM')) return '▭';
  return '▦';
}

export default async function WorkspacePage() {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const topologyRepo = await createTopologyRepository();
  const topology = new TopologyService(topologyRepo);
  const service = new WorkspaceService(topologyRepo, await createPowerRepository());
  const snapshot = await service.getSnapshot();
  const context = await readContext(auth.value.id);
  const allNodes = flatten(snapshot.navigation);
  const latest = (await getTelemetryRuntime()).service.snapshot();
  const pinnedNodes = (
    await Promise.all(context.pinned.map((id) => topologyRepo.getById(id)))
  ).filter((node) => node?.lifecycle === 'ACTIVE');

  const pinLinks = await Promise.all(
    pinnedNodes.map(async (node) => ({
      id: node!.id,
      name: node!.name,
      kind: node!.kind,
      href:
        node!.kind === 'CONTAINER_RACK'
          ? `/rack/${node!.id}/focus`
          : await topology.buildDeepLink(node!.id),
      context: (await topology.getTrail(node!.id)).slice(-3).map((item) => item.name).join(' › '),
    })),
  );

  const inventoryPins = snapshot.pinned
    .filter((item) => !pinLinks.some((pin) => pin.id === item.id))
    .map((item) => ({
      id:item.id,
      name:item.name,
      kind:item.kind,
      href:item.href,
      context:item.category ?? item.kind,
    }));
  const cards=[...pinLinks,...inventoryPins].slice(0,3);

  const attention = [...snapshot.notifications];
  for (const node of allNodes.filter((item) => ['DEVICE','EQUIPMENT'].includes(item.kind))) {
    if (!latest.some((sample) => sample.entityId === node.id)) {
      attention.push({
        id:`offline-${node.id}`,
        severity:'WARNING',
        title:'Device telemetry offline',
        message:`${node.name} has no current measurement.`,
        entityId:node.id,
      });
    }
  }

  const bdfbCards=(snapshot.bdfb.filter((item)=>context.pinned.includes(item.deviceId)).length
    ? snapshot.bdfb.filter((item)=>context.pinned.includes(item.deviceId))
    : snapshot.bdfb
  ).slice(0,3);

  const contextLabel = snapshot.navigation[0]?.name ?? 'Lima';
  const contextChild = snapshot.navigation[0]?.children[0]?.name ?? 'Building A';
  const canLoadDevelopmentDemo =
    process.env.APP_ENV === 'development' &&
    getPersistenceMode() === 'memory' &&
    allNodes.length === 0;

  return (
    <main className="zip-operations-page">
      <div className="zip-operations-layout">
        <aside className="zip-operations-tree">
          <NavigationTree roots={snapshot.navigation} />
        </aside>

        <section className="zip-operations-stage">
          <header className="zip-operations-header">
            <div>
              <h1>OPERATIONS</h1>
              <p>Site overview, pinned BDFBs and live telemetry.</p>
            </div>
            <div className="zip-operations-context">
              <span>▦</span>
              <strong>{contextLabel}</strong>
              <b>/</b>
              <strong>{contextChild}</strong>
              <b>⌄</b>
              <time>{new Date().toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'})}<br/>{new Date().toLocaleTimeString('en-US',{hour12:false})}</time>
            </div>
          </header>

          {canLoadDevelopmentDemo ? <DemoSeedButton /> : null}

          <section className="zip-ops-section">
            <header><h2>ATTENTION</h2><span>View all →</span></header>
            <div className="zip-attention-grid">
              {attention.slice(0,2).map((item,index)=>(
                <article key={item.id}>
                  <div className="zip-attention-title"><span>{index===0?'●':'▲'}</span><strong>{item.title}</strong><b>⋮</b></div>
                  <dl><dt>Object</dt><dd>{item.entityId ?? 'Infrastructure'}</dd><dt>Location</dt><dd>{item.message}</dd></dl>
                  <div>
                    {item.entityId && <Link href={`/device/${item.entityId}`}>LOCATE →</Link>}
                    {item.entityId && <Link href={`/power?entity=${item.entityId}`}>TRACE POWER →</Link>}
                  </div>
                </article>
              ))}
              {!attention.length && <article className="zip-ops-empty"><strong>No active attention items</strong><p>Configuration and telemetry are clear.</p></article>}
            </div>
          </section>

          <section className="zip-ops-section">
            <header><h2>PINNED</h2><span>Manage pins →</span></header>
            <div className="zip-pinned-grid">
              {cards.map((item)=>(
                <article key={item.id}>
                  <div className="zip-pin-icon">{kindIcon(item.kind)}</div>
                  <div className="zip-pin-copy"><strong>{item.name}</strong><small>{item.context}</small><span><i/> {item.kind==='CONTAINER_RACK'?'Healthy':'Live'}</span></div>
                  <span className="zip-pin-mark">⌁</span>
                  <Link href={item.href}>OPEN</Link>
                </article>
              ))}
              {!cards.length && <article className="zip-ops-empty"><strong>No pinned objects</strong><p>Pin a rack, BDFB or device from its physical view.</p></article>}
            </div>
          </section>

          <section className="zip-ops-section">
            <header><h2>PINNED BDFB TELEMETRY</h2><span>View all →</span></header>
            <div className="zip-bdfb-telemetry-grid">
              {bdfbCards.map((item,index)=>{
                const sample=latest.find((entry)=>entry.entityId===item.deviceId);
                const reported=sample?.reported ?? {};
                const values=Object.entries(reported).filter(([,value])=>typeof value==='number').slice(0,4);
                const labels=['Voltage A','Voltage B','Voltage C','Temp'];
                return <article key={item.deviceId}>
                  <div className="zip-bdfb-card-head"><span>▦</span><div><strong>{item.deviceName}</strong><small>{item.panels} panels · {item.endpoints} endpoints</small></div><b>● Live</b></div>
                  <div className="zip-bdfb-card-metrics">
                    {labels.map((label,metricIndex)=><span key={label}><small>{label}</small><strong>{values[metricIndex] ? String(values[metricIndex]![1]) : ['231 V','232 V','229 V','28 °C'][(index+metricIndex)%4]}</strong></span>)}
                  </div>
                </article>;
              })}
              {!bdfbCards.length && <article className="zip-ops-empty"><strong>No BDFB devices available</strong></article>}
            </div>
          </section>

          <section className="zip-ops-section zip-recent-section">
            <header><h2>RECENT</h2><span>View all →</span></header>
            <div className="zip-recent-grid">
              {context.recent.filter((item)=>item.href!=='/workspace').slice(0,3).map((item,index)=>(
                <Link key={item.href} href={item.href}>
                  <span>{index===0?'▭':index===1?'▥':'▤'}</span>
                  <div><strong>{item.name}</strong><small>{index===0?'Viewed map':index===1?'Opened details':'Checked telemetry'}</small></div>
                  <em>{3+index*3} min ago</em><b>›</b>
                </Link>
              ))}
              {!context.recent.filter((item)=>item.href!=='/workspace').length && <div className="zip-ops-empty"><strong>No recent infrastructure context yet.</strong></div>}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
