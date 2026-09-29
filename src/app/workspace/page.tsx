import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { readContext } from '@/modules/workspace/infrastructure/context-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import Link from 'next/link';
import { MetricTile, SectionHeader, StatusBadge } from '@/shared/ui/primitives';
import type { WorkspaceTreeNode } from '@/modules/workspace/application/workspace-service';
import { redirect } from 'next/navigation';

import { DemoSeedButton } from '@/components/dev/demo-seed-button';
import { BdfbSummary } from '@/components/workspace/bdfb-summary';
import { NavigationTree } from '@/components/workspace/navigation-tree';
import { NotificationPanel } from '@/components/workspace/notification-panel';
import { PinnedInventory } from '@/components/workspace/pinned-inventory';
import { WorkspaceMode } from '@/components/workspace/workspace-mode';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
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
  const telemetryAttention=allNodes.filter(n=>['DEVICE','EQUIPMENT'].includes(n.kind)).flatMap(n=>{const sample=latest.find(s=>s.entityId===n.id);if(sample&&Date.now()-Date.parse(sample.receivedAt)<=30000)return [];return [{id:`freshness-${n.id}`,severity:'WARNING' as const,title:sample?'Telemetry stale':'Telemetry offline',message:`${n.name}: ${sample?'last received '+sample.receivedAt:'no measurement received'}`,entityId:n.id}];});
  const canEdit = hasPermission(auth.value.role, 'topology:write');
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
      <div className="metric-grid">
        <MetricTile
          label="Sites"
          value={allNodes
            .filter((n) => n.kind === 'SITE')
            .length.toString()
            .padStart(2, '0')}
          detail="Across active networks"
        />
        <MetricTile
          label="Containers / racks"
          value={allNodes
            .filter((n) => n.kind === 'CONTAINER_RACK')
            .length.toString()
            .padStart(2, '0')}
          detail="Physical infrastructure"
        />
        <MetricTile
          label="Inventory"
          value={allNodes
            .filter((n) => n.kind === 'DEVICE' || n.kind === 'EQUIPMENT')
            .length.toString()
            .padStart(2, '0')}
          detail="Device + Equipment"
        />
        <MetricTile
          label="Power paths"
          value={snapshot.activePowerPaths.toString().padStart(2, '0')}
          detail="Active relationships"
        />
      </div>

      <WorkspaceMode canEdit={canEdit} />
      {canLoadDevelopmentDemo ? <DemoSeedButton /> : null}

      <div className="operations-grid">
        <aside className="operations-rail">
          <NavigationTree roots={snapshot.navigation} />
        </aside>

        <section className="operations-main">
          <div className="workspace-card-grid workspace-launchers">
            <Link className="workspace-summary-card" href="/network">
              <strong>Topology</strong>
              <span>Navigate and maintain the physical hierarchy.</span>
            </Link>
            <Link className="workspace-summary-card" href="/power">
              <strong>Power</strong>
              <span>{snapshot.activePowerPaths} active Power Paths</span>
            </Link>

          </div>

          <section className="panel"><h2>PINNED</h2><div className="workspace-card-grid">{pinLinks.map(item=><Link className="workspace-summary-card" key={item.id} href={item.href}><strong>{item.name}</strong><span>OPEN →</span></Link>)}</div>{!pinLinks.length&&<p>Pin a rack or device from its physical view.</p>}</section>
          <section className="panel"><h2>PINNED BDFB TELEMETRY</h2>{personalBdfb.map(item=><div key={item.deviceId}><Link href={item.href}>{item.deviceName}</Link><TelemetryLens entityIds={[item.deviceId]} label={item.deviceName}/></div>)}{!personalBdfb.length&&<p>No BDFB devices pinned.</p>}</section>
          <BdfbSummary items={snapshot.bdfb} />
          <section className="panel"><h2>RECENT</h2><div className="mk-recent">{context.recent.filter(item=>item.href!=='/workspace').slice(0,8).map(item=><Link key={item.href} href={item.href}>{item.name} →</Link>)}</div></section>
        </section>

        <aside className="operations-rail">
          <PinnedInventory items={snapshot.pinned} />
          <NotificationPanel notifications={[...snapshot.notifications,...telemetryAttention]} />
        </aside>
      </div>
    </main>
  );
}
