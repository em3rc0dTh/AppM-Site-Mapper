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
  const flatten = (nodes: readonly WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)]);
  const allNodes = flatten(snapshot.navigation);
  const canEdit = hasPermission(auth.value.role, 'topology:write');
  const canLoadDevelopmentDemo =
    process.env.APP_ENV === 'development' && getPersistenceMode() === 'memory' && allNodes.length === 0;

  return (
    <main className="operations-shell">
      <SectionHeader
        eyebrow="Operations / overview"
        title="Operations Workspace"
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
            <Link className="workspace-summary-card" href="/telemetry">
              <strong>Telemetry</strong>
              <span>Open authenticated realtime measurements.</span>
            </Link>
          </div>

          <BdfbSummary items={snapshot.bdfb} />
        </section>

        <aside className="operations-rail">
          <PinnedInventory items={snapshot.pinned} />
          <NotificationPanel notifications={snapshot.notifications} />
        </aside>
      </div>
    </main>
  );
}
