import { ContextPin } from '@/components/workspace/context-pin';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { RackElevation } from '@/components/rack/rack-elevation';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
export default async function DevicePage({ params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) redirect('/login');
  const { deviceId } = await params;
  const repo = await createTopologyRepository();
  const service = new TopologyService(repo);
  const node = await repo.getById(deviceId);
  if (!node || !['DEVICE', 'EQUIPMENT'].includes(node.kind) || node.lifecycle !== 'ACTIVE')
    notFound();
  if (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') notFound();
  if (node.kind === 'DEVICE' && node.bdfb) redirect(await service.buildDeepLink(node.id));
  const trail = await service.getTrail(node.id);
  const room = trail.find((n) => n.kind === 'ROOM_SUBSTRUCTURE');
  const rack = trail.find((n) => n.kind === 'CONTAINER_RACK');
  const tree = await service.buildNavigationTree(trail[0]!.id);
  const view = rack ? await new RackElevationService(repo).getView(rack.id) : null;
  const relatedPower = (await (await createPowerRepository()).listActive()).filter(
    (path) => path.source.entityId === node.id || path.target.entityId === node.id,
  );
  const hasFeedA = relatedPower.some((path) => path.feed === 'A');
  const hasFeedB = relatedPower.some((path) => path.feed === 'B');
  const links = await Promise.all(
    trail.map(async (n) => ({ id: n.id, name: n.name, href: await service.buildDeepLink(n.id) })),
  );
  const allocation =
    rack?.kind === 'CONTAINER_RACK' ? rack.cas.find((r) => r.occupantId === node.id) : undefined;
  const mountLabel =
    allocation?.mountStartU !== undefined && allocation.physicalSizeU !== undefined
      ? `U${allocation.mountStartU} – U${allocation.mountStartU + allocation.physicalSizeU - 1}`
      : 'Not mounted';
  return (
    <main className="operational-page mk-device-page">
      <nav className="breadcrumbs zip-device-breadcrumbs">
        {rack ? (
          <Link href={`/rack/${rack.id}/focus`}>← {rack.name}</Link>
        ) : links[0] ? (
          <Link href={links[0].href}>← {links[0].name}</Link>
        ) : null}
        <span className="zip-breadcrumb-divider" />
        <strong>{node.name}</strong>
      </nav>
      <div className="mk-device-layout">
        <aside>{tree && <TopologyContextTree tree={tree} activeId={node.id} />}</aside>
        <section className="zip-device-stage">
          <h1>ELEVATION</h1>
          {view?.ok ? (
            <RackElevation view={view.value} focusDeviceId={node.id} />
          ) : (
            <p>This inventory is not placed in a rack.</p>
          )}
        </section>
        <aside className="mk-inline-inspector zip-device-inspector">
          <header>
            DEVICE <span>⌄</span>
          </header>
          <div className="zip-device-identity">
            <span>▥</span>
            <div>
              <h2>{node.name}</h2>
              <small>
                {room?.name ?? 'Room'} / {rack?.name ?? 'Rack'} / {mountLabel}
              </small>
            </div>
          </div>
          <ContextPin entityId={node.id} />
          <dl>
            <dt>Identity</dt>
            <dd>{node.name}</dd>
            <dt>Model</dt>
            <dd>{node.category ?? 'Not specified'}</dd>
            <dt>Serial N.</dt>
            <dd>{node.serialNumber ?? 'Not assigned'}</dd>
            <dt>Rack</dt>
            <dd>{rack?.name ?? 'Not placed'}</dd>
            <dt>Placement</dt>
            <dd>
              {rack?.name ?? 'Not placed'} {mountLabel !== 'Not mounted' ? ` ${mountLabel}` : ''}
            </dd>
            <dt>Power A</dt>
            <dd>{hasFeedA ? 'Path recorded' : 'No recorded path'}</dd>
            <dt>Power B</dt>
            <dd>{hasFeedB ? 'Path recorded' : 'No recorded path'}</dd>
            <dt>Telemetry</dt>
            <dd>Open diagnostic to verify mapped LIVE readings</dd>
          </dl>
          {relatedPower.length > 0 ? (
            <Link className="mk-primary" href={`/power?entity=${node.id}`}>
              ϟ TRACE POWER
            </Link>
          ) : (
            <p className="device-power-unconfigured">
              No active power path is recorded for this device.
            </p>
          )}
          <div className="zip-device-live">
            <TelemetryLens entityIds={[node.id]} label={node.name} />
          </div>
          {room && rack && (
            <Link
              className="zip-device-outline"
              href={`/blueprint/${room.id}?rack=${rack?.id ?? ''}`}
            >
              ▣ LOCATE IN ROOM
            </Link>
          )}
        </aside>
      </div>
    </main>
  );
}
