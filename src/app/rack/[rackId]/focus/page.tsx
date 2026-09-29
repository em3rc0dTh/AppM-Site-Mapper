import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';

import { BlueprintCanvas } from '@/components/blueprint/blueprint-canvas';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { ContextPin } from '@/components/workspace/context-pin';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export default async function RackFocus({params}: {params:Promise<{rackId:string}>}) {
  const auth=await requirePermission('topology:read');
  if(!auth.ok) redirect('/login');

  const {rackId}=await params;
  const repo=await createTopologyRepository();
  const topology=new TopologyService(repo);
  const view=await new RackElevationService(repo).getView(rackId);
  if(!view.ok) notFound();

  const trail=await topology.getTrail(rackId);
  const room=trail.find(node=>node.kind==='ROOM_SUBSTRUCTURE');
  const position=await repo.getById(view.value.rack.parentId ?? '');
  const bay=position?.parentId ? await repo.getById(position.parentId) : null;
  const layout=room ? await new SpatialService(repo).getRoomLayout(room.id) : null;
  const rackPlacement=layout?.ok ? layout.value.racks.find(rack=>rack.id===rackId) : undefined;

  const inventoryIds=new Set(view.value.inventory.map(item=>item.id));
  const relatedPower=(await (await createPowerRepository()).listActive()).filter(path=>
    inventoryIds.has(path.source.entityId) ||
    inventoryIds.has(path.target.entityId) ||
    path.source.entityId===rackId ||
    path.target.entityId===rackId
  );
  const hasFeedA=relatedPower.some(path=>path.feed==='A');
  const hasFeedB=relatedPower.some(path=>path.feed==='B');
  const availableU=view.value.rows.filter(row=>row.role==='AVAILABLE').length;
  const equippedU=view.value.rows.filter(row=>row.role==='PHYSICAL').length;

  const breadcrumbs=await Promise.all(trail.map(async node=>({
    id:node.id,
    name:node.name,
    href:await topology.buildDeepLink(node.id),
  })));

  return (
    <main className="operational-page mk-rack-focus">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        {breadcrumbs.map(item=><Link key={item.id} href={item.href}>{item.name}</Link>)}
      </nav>

      <header className="mk-rack-focus-header">
        <div>
          <small>ROOM / RACK FOCUS</small>
          <h1>{view.value.rack.name}</h1>
          <p>Physical rack context inside {room?.name ?? 'its room'}.</p>
        </div>
        <nav className="mk-rack-actions" aria-label="Rack actions">
          <ContextPin entityId={rackId}/>
          <Link href={`/rack/${rackId}`}>ELEVATION</Link>
          <Link href={`/power?entity=${rackId}`}>POWER</Link>
          {room&&<Link href={`/blueprint/${room.id}?rack=${rackId}`}>LOCATE IN ROOM</Link>}
        </nav>
      </header>

      <div className="mk-rack-focus-layout">
        <section className="mk-rack-room-context">
          {room && layout?.ok && room.polygon ? (
            <BlueprintCanvas
              polygon={layout.value.room.polygon ?? []}
              clusters={layout.value.clusters}
              racks={layout.value.racks}
              slots={layout.value.assignableSlots}
              focusRackId={rackId}
            />
          ) : (
            <div className="mk-empty-boundary">Room geometry is unavailable for this rack.</div>
          )}
        </section>

        <aside className="mk-inline-inspector mk-rack-focus-inspector">
          <small>RACK INSPECTOR</small>
          <h2>{view.value.rack.name}</h2>
          <dl>
            <dt>Room</dt><dd>{room?.name ?? 'Unknown'}</dd>
            <dt>Bay</dt><dd>{bay?.name ?? 'Not assigned'}</dd>
            <dt>Position</dt><dd>{position?.name ?? 'Not assigned'}</dd>
            <dt>Footprint</dt><dd>{rackPlacement ? `${rackPlacement.rect.width} × ${rackPlacement.rect.depth} mm` : 'Not available'}</dd>
            <dt>Capacity</dt><dd>{view.value.rack.totalU ?? view.value.rows.length} U</dd>
            <dt>Equipped</dt><dd>{equippedU} U</dd>
            <dt>Available</dt><dd>{availableU} U</dd>
            <dt>Devices</dt><dd>{view.value.inventory.length}</dd>
            <dt>Power A</dt><dd>{hasFeedA ? 'Configured' : 'Not configured'}</dd>
            <dt>Power B</dt><dd>{hasFeedB ? 'Configured' : 'Not configured'}</dd>
          </dl>
          <Link className="mk-primary" href={`/rack/${rackId}`}>OPEN RACK ELEVATION</Link>
          {view.value.inventory.map(item=><Link key={item.id} href={`/device/${item.id}`}>{item.name} →</Link>)}
          <TelemetryLens label={view.value.rack.name} entityIds={view.value.inventory.map(item=>item.id)}/>
        </aside>
      </div>
    </main>
  );
}
