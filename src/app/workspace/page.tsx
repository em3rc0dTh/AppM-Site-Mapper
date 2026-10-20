import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DemoSeedButton } from '@/components/dev/demo-seed-button';
import { NavigationTree } from '@/components/workspace/navigation-tree';
import { HomeSidebar } from '@/components/workspace/home-sidebar';
import { HomeLiveOverview } from '@/components/workspace/home-live-overview';
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
      context: (await topology.getTrail(node!.id))
        .slice(-3)
        .map((item) => item.name)
        .join(' › '),
    })),
  );

  const inventoryPins = snapshot.pinned
    .filter((item) => !pinLinks.some((pin) => pin.id === item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      href: item.href,
      context: item.category ?? item.kind,
    }));
  const cards = [...pinLinks, ...inventoryPins].slice(0, 3);

  const equipmentNodes = allNodes.filter((node) => node.kind === 'DEVICE');
  const bdfbRows = snapshot.bdfb;
  const contextLabel = snapshot.navigation[0]?.name ?? 'Lima';
  const contextChild = snapshot.navigation[0]?.children[0]?.name ?? 'Building A';
  const canLoadDevelopmentDemo =
    process.env.APP_ENV === 'development' &&
    getPersistenceMode() === 'memory' &&
    allNodes.length === 0;

  return (
    <main className="sm-home">
      <HomeSidebar tree={<NavigationTree roots={snapshot.navigation} />} />
      <section className="sm-home-main">
        <header className="sm-home-heading">
          <div><span className="sm-home-breadcrumb">⌂ Home</span><h1>Infrastructure overview</h1></div>
          <span className="sm-home-scope">{contextLabel} / {contextChild}</span>
        </header>
        {canLoadDevelopmentDemo ? <DemoSeedButton /> : null}
        <HomeLiveOverview equipmentIds={equipmentNodes.map((node) => node.id)} bdfbs={bdfbRows} cards={cards} initialSamples={latest} />
      </section>
    </main>
  );
}
