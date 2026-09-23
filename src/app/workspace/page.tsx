import Link from 'next/link';
import { redirect } from 'next/navigation';

import { BdfbSummary } from '@/components/workspace/bdfb-summary';
import { NavigationTree } from '@/components/workspace/navigation-tree';
import { NotificationPanel } from '@/components/workspace/notification-panel';
import { PinnedInventory } from '@/components/workspace/pinned-inventory';
import { WorkspaceMode } from '@/components/workspace/workspace-mode';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
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
  const canEdit = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="operations-shell">
      <header className="operations-header">
        <div>
          <p className="eyebrow">AppManager · Site Mapper</p>
          <h1>Operations Workspace</h1>
          <p>Physical topology, capacity, power and realtime operations from one trusted model.</p>
        </div>
        <div className="operations-user">
          <strong>{auth.value.displayName}</strong>
          <span>{auth.value.role}</span>
        </div>
      </header>

      <WorkspaceMode canEdit={canEdit} />

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
