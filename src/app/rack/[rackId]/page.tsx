import Link from 'next/link';
import { topologyHref } from '@/shared/ui/topology-navigation';
import { notFound, redirect } from 'next/navigation';

import { TopologyContextTree, type ContextTreeEntry } from '@/components/topology/context-tree';
import { RackElevation } from '@/components/rack/rack-elevation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function RackPage({
  params,
}: Readonly<{ params: Promise<{ rackId: string }> }>) {
  const { rackId } = await params;
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect(`/login?next=${encodeURIComponent(`/rack/${encodeURIComponent(rackId)}`)}`);
  }

  const repository = await createTopologyRepository();
  const elevation = new RackElevationService(repository);
  const topology = new TopologyService(repository);
  const result = await elevation.getView(rackId);

  if (!result.ok) {
    notFound();
  }

  const [trail, children, parent] = await Promise.all([
    topology.getTrail(rackId),
    topology.listChildren(rackId),
    result.value.rack.parentId
      ? topology.getById(result.value.rack.parentId)
      : Promise.resolve(null),
  ]);
  const trailEntries: ContextTreeEntry[] = await Promise.all(
    trail.map(async (node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      href: await topologyHref(topology, node),
    })),
  );
  const childEntries: ContextTreeEntry[] = await Promise.all(
    children.map(async (node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      href: await topologyHref(topology, node),
    })),
  );
  const inventoryLinks = Object.fromEntries(
    await Promise.all(
      result.value.inventory.map(async (item) => [item.id, await topology.buildDeepLink(item.id)]),
    ),
  );

  return (
    <main className="operational-page operational-page--rack">
      <nav className="breadcrumbs operational-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/network">Network index</Link>
        {trailEntries.map((entry) => (
          <Link
            key={entry.id}
            href={entry.href}
            aria-current={entry.id === rackId ? 'page' : undefined}
          >
            {entry.name}
          </Link>
        ))}
      </nav>
      <div className="operational-layout operational-layout--rack">
        <aside className="operational-context">
          <TopologyContextTree trail={trailEntries} descendants={childEntries} />
        </aside>
        <section className="operational-stage operational-stage--wide">
          <RackElevation
            view={result.value}
            inventoryLinks={inventoryLinks}
            {...(parent?.kind === 'POSITION'
              ? {
                  context: {
                    positionName: parent.name,
                    coordinate: `${parent.coordinate.row}-${parent.coordinate.column}`,
                  },
                }
              : {})}
          />
        </section>
      </div>
    </main>
  );
}
