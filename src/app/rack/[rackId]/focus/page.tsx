import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { ContextPin } from '@/components/workspace/context-pin';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function RackFocus({ params }: { params: Promise<{ rackId: string }> }) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');

  const { rackId } = await params;
  const repo = await createTopologyRepository();
  const topology = new TopologyService(repo);
  const view = await new RackElevationService(repo).getView(rackId);
  if (!view.ok) notFound();

  const trail = await topology.getTrail(rackId);
  const room = trail.find((node) => node.kind === 'ROOM_SUBSTRUCTURE');
  const position = await repo.getById(view.value.rack.parentId ?? '');
  const bay = position?.parentId ? await repo.getById(position.parentId) : null;
  const root = trail[0];
  const tree = root ? await topology.buildNavigationTree(root.id) : null;

  const siblingPositions =
    bay?.kind === 'CONTAINER_CLUSTER_BAY' ? await repo.listChildren(bay.id) : [];
  const siblingRacks = (
    await Promise.all(
      siblingPositions
        .filter((node) => node.kind === 'POSITION')
        .map((node) => repo.listChildren(node.id)),
    )
  )
    .flat()
    .filter((node) => node.kind === 'CONTAINER_RACK' && node.id !== rackId)
    .slice(0, 4);

  const inventoryIds = new Set(view.value.inventory.map((item) => item.id));
  const relatedPower = (await (await createPowerRepository()).listActive()).filter(
    (path) =>
      inventoryIds.has(path.source.entityId) ||
      inventoryIds.has(path.target.entityId) ||
      path.source.entityId === rackId ||
      path.target.entityId === rackId,
  );
  const hasFeedA = relatedPower.some((path) => path.feed === 'A');
  const hasFeedB = relatedPower.some((path) => path.feed === 'B');
  const availableU = view.value.rows.filter((row) => row.role === 'AVAILABLE').length;
  const reservedU = view.value.rows.filter((row) => row.role === 'RESERVED').length;
  const equippedU = view.value.rows.filter((row) => row.role === 'PHYSICAL').length;

  return (
    <main className="operational-page">
      <nav className="breadcrumbs zip-rack-focus-breadcrumbs" aria-label="Breadcrumb">
        {room ? <Link href={await topology.buildDeepLink(room.id)}>← {room.name}</Link> : null}
        <span className="zip-breadcrumb-divider" />
        <strong>RACK FOCUS &nbsp;/&nbsp; {view.value.rack.name}</strong>
      </nav>

      <div className="zip-rack-focus-layout">
        <aside className="zip-rack-topology">
          {tree ? <TopologyContextTree tree={tree} activeId={rackId} /> : null}
        </aside>

        <section className="zip-rack-focus-stage">
          <h1>RACK FOCUS</h1>
          <div className="zip-rack-room">
            <div className="zip-rack-perspective" aria-hidden="true" />
            {siblingRacks.map((rack, index) => (
              <div
                key={rack.id}
                className={`zip-neighbor-rack zip-neighbor-rack--${index + 1}`}
                aria-hidden="true"
              >
                <strong>{rack.name}</strong>
                <span />
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - siblingRacks.length) }).map((_, index) => (
              <div
                key={`ghost-${index}`}
                className={`zip-neighbor-rack zip-neighbor-rack--${siblingRacks.length + index + 1}`}
                aria-hidden="true"
              >
                <strong>RACK</strong>
                <span />
              </div>
            ))}

            <div className="zip-focus-rack">
              <strong className="zip-focus-rack-name">{view.value.rack.name}</strong>
              <div className="zip-focus-rack-frame">
                {view.value.rows.map((row, index) => {
                  const previous = view.value.rows[index - 1];
                  const showLabel =
                    row.occupant &&
                    (!previous?.occupant || previous.occupant.id !== row.occupant.id);
                  return (
                    <div
                      key={row.u}
                      className={`zip-focus-rack-block is-${row.role.toLowerCase()}`}
                    >
                      <span>{row.u}U</span>
                      {showLabel ? <strong>{row.occupant?.name}</strong> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <footer className="zip-rack-focus-footer">
            <span>{room?.name ?? 'ROOM'}</span>
            <span>{bay?.name ?? 'BAY'}</span>
            <span>{position?.name ?? 'POSITION'}</span>
            <div>
              <button type="button">−</button>
              <b>100%</b>
              <button type="button">+</button>
            </div>
            <strong>● SYNCED</strong>
          </footer>
        </section>

        <aside className="zip-rack-inspector">
          <header>
            INSPECTOR <span>⌄</span>
          </header>
          <div className="zip-rack-identity">
            <span>▥</span>
            <div>
              <h2>{view.value.rack.name}</h2>
              <small>{room?.name ?? 'Room'} / {bay?.name ?? 'Bay'} / {position?.name ?? 'Position'}</small>
            </div>
          </div>
          <dl>
            <dt>Capacity</dt><dd>{view.value.rack.totalU ?? view.value.rows.length}U</dd>
            <dt>Equipped</dt><dd>{equippedU}U</dd>
            <dt>Reserved</dt><dd>{reservedU}U</dd>
            <dt>Available</dt><dd>{availableU}U</dd>
            <dt>Power A</dt><dd>{hasFeedA ? 'Configured ✓' : 'Not configured'}</dd>
            <dt>Power B</dt><dd>{hasFeedB ? 'Configured ✓' : 'Not configured'}</dd>
            <dt>Telemetry</dt><dd>Contextual lens</dd>
          </dl>
          <h3>OCCUPANCY</h3>
          <div className="zip-occupancy-list">
            {view.value.inventory.slice(0, 8).map((item) => (
              <div key={item.id}>
                <span>DEVICE</span>
                <strong>{item.name}</strong>
                <span>›</span>
              </div>
            ))}
          </div>
          <div className="zip-rack-inspector-actions">
            <Link href={`/rack/${rackId}`}>ELEVATION</Link>
            <Link href={`/power?entity=${rackId}`}>POWER</Link>
            {room ? <Link href={`/blueprint/${room.id}?rack=${rackId}`}>LOCATE</Link> : null}
          </div>
          <ContextPin entityId={rackId} />
          <TelemetryLens
            label={view.value.rack.name}
            entityIds={view.value.inventory.map((item) => item.id)}
          />
        </aside>
      </div>
    </main>
  );
}
