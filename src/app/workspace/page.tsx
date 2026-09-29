import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { readContext } from '@/modules/workspace/infrastructure/context-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import Link from 'next/link';
import { SectionHeader, StatusBadge } from '@/shared/ui/primitives';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
import { redirect } from 'next/navigation';

import { DemoSeedButton } from '@/components/dev/demo-seed-button';
import { NavigationTree } from '@/components/workspace/navigation-tree';
import { NotificationPanel } from '@/components/workspace/notification-panel';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const service = new WorkspaceService(
    await createTopologyRepository(),
    await createPowerRepository(),
  );
  const snapshot = await service.getSnapshot();
  const context=await readContext(auth.value.id);
  const repo=await createTopologyRepository();
  const pinned=(await Promise.all(context.pinned.map(id=>repo.getById(id)))).filter(n=>n?.lifecycle==='ACTIVE');
  const pinLinks=await Promise.all(pinned.map(async n=>({id:n!.id,name:n!.name,href:n!.kind==='CONTAINER_RACK'?`/rack/${n!.id}/focus`:await new TopologyService(repo).buildDeepLink(n!.id)})));
  const personalBdfb=snapshot.bdfb.filter(b=>context.pinned.includes(b.deviceId));
  const flatten = (nodes: readonly WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)]);
  const allNodes = flatten(snapshot.navigation);
  const latest=(await getTelemetryRuntime()).service.snapshot();
  const telemetryAttention=allNodes.filter(n=>['DEVICE','EQUIPMENT'].includes(n.kind)).flatMap(n=>{const sample=latest.find(s=>s.entityId===n.id);if(sample)return [];return [{id:`freshness-${n.id}`,severity:'WARNING' as const,title:'Telemetry offline',message:`${n.name}: no measurement received`,entityId:n.id}];});
  const canLoadDevelopmentDemo =
    process.env.APP_ENV === 'development' &&
    getPersistenceMode() === 'memory' &&
    allNodes.length === 0;

  return (
    <main className="operations-shell mk-operations">
      <SectionHeader
        eyebrow="Operations / overview"
        title="OPERATIONS"
        description="Your physical infrastructure, connected in one operational view."
        actions={
          <>
            <StatusBadge>{auth.value.role}</StatusBadge>
            <span>{auth.value.displayName}</span>
          </>
        }
      />
      {canLoadDevelopmentDemo ? <DemoSeedButton /> : null}

      <div className="operations-grid mk-operations-grid">
        <aside className="operations-rail">
          <NavigationTree roots={snapshot.navigation} />
        </aside>

        <section className="operations-main mk-operations-main">
          <NotificationPanel notifications={[...snapshot.notifications,...telemetryAttention]} />

          <section className="panel">
            <div className="workspace-section-title">
              <span>PINNED</span>
              <strong>{pinLinks.length + snapshot.pinned.length}</strong>
            </div>
            <div className="workspace-card-grid">
              {pinLinks.map(item=><Link className="workspace-summary-card" key={item.id} href={item.href}><strong>{item.name}</strong><span>OPEN →</span></Link>)}
              {snapshot.pinned.filter(item=>!pinLinks.some(pin=>pin.id===item.id)).map(item=><Link className="workspace-summary-card" key={item.id} href={item.href}><strong>{item.name}</strong><span>{item.kind === 'DEVICE' ? 'DEVICE' : 'EQUIPMENT'} · OPEN →</span></Link>)}
            </div>
            {!pinLinks.length&&!snapshot.pinned.length&&<p>Pin a rack, BDFB or device from its physical view.</p>}
          </section>

          <section className="panel">
            <div className="workspace-section-title">
              <span>PINNED BDFB TELEMETRY</span>
              <Link href="/power">Power</Link>
            </div>
            <div className="mk-pinned-telemetry-grid">
              {personalBdfb.map(item=><article key={item.deviceId}><Link href={item.href}><strong>{item.deviceName}</strong></Link><TelemetryLens entityIds={[item.deviceId]} label={item.deviceName}/></article>)}
            </div>
            {!personalBdfb.length&&<p>No BDFB devices pinned.</p>}
          </section>

          <section className="panel">
            <div className="workspace-section-title">
              <span>RECENT</span>
              <Link href="/network">Open topology</Link>
            </div>
            <div className="mk-recent">{context.recent.filter(item=>item.href!=='/workspace').slice(0,8).map(item=><Link key={item.href} href={item.href}>{item.name} →</Link>)}</div>
            {!context.recent.filter(item=>item.href!=='/workspace').length&&<p>No recent infrastructure context yet.</p>}
          </section>
        </section>
      </div>
    </main>
  );
}
