import { ContextPin } from '@/components/workspace/context-pin';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { CasEditor } from '@/components/rack/cas-editor';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { hasPermission } from '@/modules/identity/domain/roles';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

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
  const room = [...trail].reverse().find((item) => item.kind === 'ROOM_SUBSTRUCTURE') ?? null;
  const root = trail[0];
  const navigationTree = root ? await topology.buildNavigationTree(root.id) : null;
  const trailEntries = await Promise.all(
    trail.map(async (item) => ({
      id: item.id,
      name: item.name,
      href: await topology.buildDeepLink(item.id),
    })),
  );

  return (
    <main className="operational-page operational-page--rack telxius-operational-page zip-rack-elevation-page">
      <nav
        className="breadcrumbs operational-breadcrumbs telxius-breadcrumbs zip-rack-elevation-breadcrumbs"
        aria-label="Breadcrumb"
      >
        {room ? (
          <Link href={await topology.buildDeepLink(room.id)}>← {room.name}</Link>
        ) : trailEntries[0] ? (
          <Link href={trailEntries[0].href}>← {trailEntries[0].name}</Link>
        ) : null}
        <span className="zip-breadcrumb-divider" />
        <strong>{result.value.rack.name} &nbsp;/&nbsp; ELEVATION</strong>
      </nav>
      <div className="operational-layout telxius-operational-layout operational-layout--rack">
        <aside className="zip-rack-menu zip-rack-tree-menu">
          {navigationTree && <TopologyContextTree tree={navigationTree} activeId={rackId} />}
          <details className="rack-tools-disclosure">
            <summary>Rack actions</summary>
            {room && <Link href={`/blueprint/${room.id}?rack=${rackId}`}>LOCATE IN ROOM</Link>}
            <Link href={`/rack/${rackId}/focus`}>RACK FOCUS</Link>
            <Link href={`/power?entity=${rackId}`}>POWER PATH</Link>
          </details>
        </aside>
        <section className="operational-stage operational-stage--wide zip-rack-elevation-stage">
          <RackElevation
            view={result.value}
            canWrite={hasPermission(auth.value.role, 'topology:write')}
            {...(parent?.kind === 'POSITION'
              ? {
                  context: {
                    positionName: parent.name,
                    coordinate: `${parent.coordinate.row}-${parent.coordinate.column}`,
                  },
                }
              : {})}
          />
          <div className="zip-rack-elevation-footer">
            <span className="is-available">
              □ AVAILABLE{' '}
              <b>{result.value.rows.filter((row) => row.role === 'AVAILABLE').length}U</b>
            </span>
            <span className="is-reserved">
              □ RESERVED <b>{result.value.rows.filter((row) => row.role === 'RESERVED').length}U</b>
            </span>
            <span className="is-equipped">
              □ EQUIPPED <b>{result.value.rows.filter((row) => row.role === 'PHYSICAL').length}U</b>
            </span>
            <div />
            {hasPermission(auth.value.role, 'topology:write') && (
              <details className="zip-cas-popover">
                <summary>✎ EDIT CAS</summary>
                <CasEditor view={result.value} />
              </details>
            )}
            <ContextPin entityId={rackId} />
          </div>
          <div id="telemetry" className="zip-rack-telemetry">
            <TelemetryLens
              label={result.value.rack.name}
              entityIds={result.value.inventory.map((item) => item.id)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
