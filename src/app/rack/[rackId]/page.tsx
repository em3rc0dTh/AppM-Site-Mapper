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
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const { rackId } = await params;
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
      href: await topology.buildDeepLink(node.id),
    })),
  );
  const childEntries: ContextTreeEntry[] = await Promise.all(
    children.map(async (node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      href: await topology.buildDeepLink(node.id),
    })),
  );

  return (
    <main className="operational-page operational-page--rack">
      <div className="operational-layout operational-layout--rack">
        <aside className="operational-context">
          <TopologyContextTree trail={trailEntries} descendants={childEntries} />
        </aside>
        <section className="operational-stage operational-stage--wide">
          <RackElevation
            view={result.value}
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
