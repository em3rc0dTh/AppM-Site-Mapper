import { ContextPin } from '@/components/workspace/context-pin';
import { CasEditor } from '@/components/rack/cas-editor';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { hasPermission } from '@/modules/identity/domain/roles';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { TopologyContextTree } from '@/components/topology/context-tree';
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

  const [trail, parent] = await Promise.all([
    topology.getTrail(rackId),
    result.value.rack.parentId
      ? topology.getById(result.value.rack.parentId)
      : Promise.resolve(null),
  ]);
  const root =
    [...trail].reverse().find((item) => item.kind === 'ROOM_SUBSTRUCTURE') ??
    [...trail].reverse().find((item) => item.kind === 'LEVEL') ??
    trail[0];
  const tree = root ? await topology.buildNavigationTree(root.id) : null;
  const trailEntries = await Promise.all(
    trail.map(async (item) => ({
      id: item.id,
      name: item.name,
      href: await topology.buildDeepLink(item.id),
    })),
  );

  return (
    <main className="operational-page operational-page--rack telxius-operational-page">
      <nav
        className="breadcrumbs operational-breadcrumbs telxius-breadcrumbs"
        aria-label="Breadcrumb"
      >
        {trailEntries.map((item) => (
          <Link key={item.id} href={item.href}>
            {item.name}
          </Link>
        ))}
      </nav>
      <div className="operational-layout telxius-operational-layout operational-layout--rack">
        <aside className="operational-context">
          {tree && <TopologyContextTree tree={tree} activeId={rackId} />}
        </aside>
        <section className="operational-stage operational-stage--wide">
          <nav className="mk-rack-actions"><ContextPin entityId={rackId}/><Link href={`/rack/${rackId}/focus`}>RACK FOCUS</Link><Link href={`/power?entity=${rackId}`}>POWER</Link>{root?.kind === 'ROOM_SUBSTRUCTURE' && <Link href={`/blueprint/${root.id}?rack=${rackId}`}>LOCATE</Link>}</nav>
          <TelemetryLens label={result.value.rack.name} entityIds={result.value.inventory.map(item => item.id)} />
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
          {hasPermission(auth.value.role, 'topology:write') && <CasEditor view={result.value} />}
        </section>
      </div>
    </main>
  );
}
