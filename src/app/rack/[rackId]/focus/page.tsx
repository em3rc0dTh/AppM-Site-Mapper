import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ContextPin } from '@/components/workspace/context-pin';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

interface FocusBlock {
  readonly key: string;
  readonly role: string;
  readonly topU: number;
  readonly bottomU: number;
  readonly units: number;
  readonly name: string;
}

function focusBlocks(
  rows: readonly { u: number; role: string; occupant?: { id: string; name: string } }[],
) {
  const blocks: FocusBlock[] = [];
  for (const row of rows) {
    const previous = blocks.at(-1);
    const name = row.occupant?.name ?? row.role;
    if (
      previous &&
      previous.role === row.role &&
      previous.name === name &&
      previous.bottomU - 1 === row.u
    ) {
      blocks[blocks.length - 1] = {
        ...previous,
        bottomU: row.u,
        units: previous.units + 1,
      };
    } else {
      blocks.push({
        key: `${row.role}-${row.occupant?.id ?? row.u}`,
        role: row.role,
        topU: row.u,
        bottomU: row.u,
        units: 1,
        name,
      });
    }
  }
  return blocks;
}

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
  const roomRacks = room
    ? (
        await Promise.all(
          (await repo.listChildren(room.id))
            .filter((node) => node.kind === 'CONTAINER_CLUSTER_BAY')
            .map(async (cluster) =>
              (
                await Promise.all(
                  (await repo.listChildren(cluster.id))
                    .filter((node) => node.kind === 'POSITION')
                    .map(async (positionNode) =>
                      (await repo.listChildren(positionNode.id))
                        .filter((node) => node.kind === 'CONTAINER_RACK')
                        .map((rackNode) => ({ rack: rackNode, position: positionNode })),
                    ),
                )
              ).flat(),
            ),
        )
      ).flat()
    : [];
  const rackLinks = await Promise.all(
    roomRacks.map(async ({ rack, position: rackPosition }) => ({
      id: rack.id,
      name: rack.name,
      position: rackPosition.name,
      href: `/rack/${rack.id}/focus`,
    })),
  );
  const position = await repo.getById(view.value.rack.parentId ?? '');
  const bay = position?.parentId ? await repo.getById(position.parentId) : null;
  const blocks = focusBlocks(view.value.rows);
  const relatedPower = (await (await createPowerRepository()).listActive()).filter((path) =>
    view.value.inventory.some(
      (item) => item.id === path.source.entityId || item.id === path.target.entityId,
    ),
  );
  const hasFeedA = relatedPower.some((path) => path.feed === 'A');
  const hasFeedB = relatedPower.some((path) => path.feed === 'B');
  const availableSpans = blocks.filter((block) => block.role === 'AVAILABLE');
  const availableU = availableSpans.reduce((sum, block) => sum + block.units, 0);

  const breadcrumbs = await Promise.all(
    trail.map(async (node) => ({
      id: node.id,
      name: node.name,
      href: await topology.buildDeepLink(node.id),
    })),
  );

  return (
    <main className="operational-page zip-rack-focus-page">
      <nav className="breadcrumbs zip-rack-focus-breadcrumbs" aria-label="Breadcrumb">
        {room ? (
          <Link href={await topology.buildDeepLink(room.id)}>← {room.name}</Link>
        ) : breadcrumbs[0] ? (
          <Link href={breadcrumbs[0].href}>← {breadcrumbs[0].name}</Link>
        ) : null}
        <span className="zip-breadcrumb-divider" />
        <strong>
          {room?.name ?? 'Room'} &nbsp;/&nbsp; {view.value.rack.name}
        </strong>
      </nav>

      <div className="zip-rack-focus-layout">
        <aside className="zip-rack-topology">
          <header>
            TOPOLOGY <span>⌄</span>
          </header>
          <div className="zip-rack-topology-path">
            <span>◎</span>
            <strong>Lima</strong>
            <span>▦</span>
            <strong>Building A</strong>
            <span>▱</span>
            <strong>Level 02</strong>
            <span>□</span>
            <strong>{room?.name ?? 'Room'}</strong>
          </div>
          <nav>
            {rackLinks.map((item) => (
              <Link
                key={item.id}
                className={item.id === rackId ? 'is-active' : ''}
                href={item.href}
              >
                <span>▥</span>
                <strong>{item.name}</strong>
              </Link>
            ))}
          </nav>
        </aside>

        <section className="zip-rack-focus-stage">
          <h1>RACK FOCUS</h1>
          <div className="zip-rack-room">
            <div className="zip-rack-perspective" aria-hidden="true" />
            {[-2, -1, 1, 2].map((offset, index) => (
              <div key={offset} className={`zip-neighbor-rack zip-neighbor-rack--${index + 1}`}>
                <strong>{['R-021', 'R-022', 'R-024', 'R-025'][index]}</strong>
                <span />
              </div>
            ))}
            <div className="zip-focus-rack">
              <strong className="zip-focus-rack-name">{view.value.rack.name}</strong>
              <div className="zip-focus-rack-frame">
                {blocks.map((block) => (
                  <div
                    key={block.key}
                    className={`zip-focus-rack-block is-${block.role.toLowerCase()}`}
                    style={{ flexGrow: block.units, flexBasis: 0 }}
                  >
                    <span>U{block.topU}</span>
                    <strong>{block.role === 'PHYSICAL' ? block.name : block.role}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <footer className="zip-rack-focus-footer">
            <span>⌑ {position?.name ?? 'Position'}</span>
            <span>{room?.name ?? 'Room'}</span>
            <span>▥ {view.value.rack.name}</span>
            <span>⌖ LOCATE</span>
            <div>
              <button>−</button>
              <b>100%</b>
              <button>+</button>
            </div>
            <button>⌗ FIT RACK</button>
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
              <small>
                {room?.name ?? 'Room'} / {bay?.name ?? 'Bay'} / {position?.name ?? 'Position'}
              </small>
            </div>
          </div>
          <dl>
            <dt>Position</dt>
            <dd>{position?.name ?? '—'}</dd>
            <dt>Height</dt>
            <dd>{view.value.rack.totalU ?? view.value.rows.length}U</dd>
            <dt>Devices</dt>
            <dd>{view.value.inventory.length}</dd>
            <dt>Available slots</dt>
            <dd>
              {availableSpans.length} spans ({availableU}U)
            </dd>
            <dt>Power</dt>
            <dd>
              A {hasFeedA ? '✓' : '—'} &nbsp;&nbsp; B {hasFeedB ? '✓' : '—'}
            </dd>
            <dt>Status</dt>
            <dd>
              <span className="zip-green-dot" /> ONLINE
            </dd>
            <dt>Mounting clearance</dt>
            <dd>Standard (front/rear)</dd>
          </dl>
          <h3>DEVICE OCCUPANCY</h3>
          <div className="zip-occupancy-list">
            {blocks.map((block) => (
              <div key={block.key}>
                <span>
                  U{String(block.topU).padStart(2, '0')} – U{String(block.bottomU).padStart(2, '0')}
                </span>
                <strong>{block.role === 'PHYSICAL' ? block.name : block.role}</strong>
                <small>{block.units}U</small>
              </div>
            ))}
          </div>
          <div className="zip-rack-inspector-actions">
            <Link className="is-primary" href={`/rack/${rackId}`}>
              ELEVATION
            </Link>
            <Link href={`/power?entity=${rackId}`}>POWER</Link>
            <a href="#telemetry">TELEMETRY</a>
            {room ? (
              <Link href={`/blueprint/${room.id}?rack=${rackId}`}>LOCATE</Link>
            ) : (
              <span>LOCATE</span>
            )}
          </div>
          <ContextPin entityId={rackId} />
        </aside>
      </div>
    </main>
  );
}
