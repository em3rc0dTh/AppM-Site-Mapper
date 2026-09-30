import Link from 'next/link';
import { RoomLayoutEditor } from '@/components/blueprint/room-layout-editor';
import { readLayoutDraft } from '@/modules/spatial/application/layout-editor-service';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { notFound, redirect } from 'next/navigation';

import { TopologyContextTree } from '@/components/topology/context-tree';
import { requirePermission } from '@/modules/identity/application/current-session';
import { hasPermission } from '@/modules/identity/domain/roles';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { polygonArea } from '@/modules/spatial/domain/geometry';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { SectionHeader, StatusBadge } from '@/shared/ui/primitives';

export default async function BlueprintPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ rack?: string; bay?: string; position?: string }>;
}>) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    redirect('/login');
  }

  const [{ roomId }, query] = await Promise.all([params, searchParams]);
  const repository = await createTopologyRepository();
  const topology = new TopologyService(repository);
  const result = await new SpatialService(repository).getRoomLayout(roomId);

  if (!result.ok) {
    notFound();
  }

  const draft = await readLayoutDraft(repository, roomId);
  const trail = await topology.getTrail(roomId);
  const breadcrumbItems = await Promise.all(
    trail
      .filter(
        (entry) =>
          entry.kind === 'SITE' ||
          entry.kind === 'STRUCTURE' ||
          entry.kind === 'LEVEL' ||
          entry.kind === 'ROOM_SUBSTRUCTURE',
      )
      .map(async (entry) => ({
        id: entry.id,
        name: entry.name,
        href: await topology.buildDeepLink(entry.id),
      })),
  );
  const inventory = (
    await Promise.all(result.value.racks.map((r) => repository.listChildren(r.id)))
  ).flat();
  const root = trail[0];
  const tree = root ? await topology.buildNavigationTree(root.id) : null;
  const canWrite = hasPermission(auth.value.role, 'topology:write');

  return (
    <main className="operational-page operational-page--blueprint">
      <nav className="breadcrumbs">
        {breadcrumbItems.map((entry) => (
          <Link
            key={entry.id}
            href={entry.id === roomId ? `/blueprint/${roomId}` : entry.href}
            title={entry.name}
          >
            {entry.name}
          </Link>
        ))}
      </nav>
      <div className="operational-layout operational-layout--blueprint">
        <aside className="operational-context">
          {tree && <TopologyContextTree tree={tree} activeId={roomId} />}
        </aside>

        <section className="operational-stage operational-stage--wide">
          <SectionHeader
            eyebrow="SUBSTRUCTURE / ROOM BLUEPRINT"
            title={result.value.room.name.toUpperCase()}
            description={
              result.value.room.polygon?.length
                ? 'Surveyed room boundary · bay footprints · 600 × 600 mm position grid'
                : 'Unsurveyed room · inventory topology only; no layout invented'
            }
            actions={<StatusBadge>{canWrite ? 'EDIT PERMITTED' : 'READ ONLY'}</StatusBadge>}
          />

          <TelemetryLens label={result.value.room.name} entityIds={inventory.map((n) => n.id)} />
          {draft && (
            <RoomLayoutEditor
              key={`${roomId}:${query.rack ?? ''}:${query.bay ?? ''}:${query.position ?? ''}`}
              roomId={roomId}
              initial={draft.draft}
              canWrite={canWrite}
              focusRackId={query.rack}
              focusBayId={query.bay}
              focusPositionId={query.position}
            />
          )}
        </section>
        <aside className="zip-room-properties">
          <header>ROOM PROPERTIES</header>
          <section className="room-general-info">
            <h3>GENERAL INFORMATION</h3>
            <dl>
              <dt>Name</dt>
              <dd>{result.value.room.name}</dd>
              <dt>Type</dt>
              <dd>{result.value.room.variant}</dd>
              <dt>Geometry</dt>
              <dd>
                {result.value.room.polygon?.length
                  ? `${result.value.room.polygon.length} surveyed vertices`
                  : 'Not surveyed'}
              </dd>
              {result.value.room.polygon?.length ? (
                <>
                  <dt>Area</dt>
                  <dd>{(polygonArea(result.value.room.polygon) / 1_000_000).toFixed(2)} m²</dd>
                </>
              ) : null}
              <dt>Rack footprints</dt>
              <dd>{result.value.racks.length}</dd>
            </dl>
          </section>
          <section>
            <small>TOTAL CLUSTERS</small>
            <strong>{result.value.clusters.length}</strong>
          </section>
          <section className="room-rack-navigation">
            <small>RACKS IN THIS ROOM · {result.value.racks.length}</small>
            {result.value.racks.map((rack) => (
              <Link
                key={rack.id}
                href={
                  result.value.room.polygon?.length
                    ? `/blueprint/${roomId}?rack=${encodeURIComponent(rack.id)}`
                    : `/rack/${rack.id}`
                }
              >
                {rack.name} <span>INSPECT ↗</span>
              </Link>
            ))}
          </section>
          <div>
            <span>⌗</span>
            <p>
              CLICK A CLUSTER OR CABINET
              <br />
              TO INSPECT PROPERTIES
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
