import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { TopologyContextTree } from '@/components/topology/context-tree';
import { RackElevation } from '@/components/rack/rack-elevation';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
export default async function DevicePage({params}: {params:Promise<{deviceId:string}>}) {
  const auth=await requirePermission('topology:read');if(!auth.ok)redirect('/login');
  const {deviceId}=await params;const repo=await createTopologyRepository();const service=new TopologyService(repo);const node=await repo.getById(deviceId);
  if(!node || !['DEVICE','EQUIPMENT'].includes(node.kind) || node.lifecycle!=='ACTIVE')notFound();
  if(node.kind!=='DEVICE' && node.kind!=='EQUIPMENT')notFound();
  if(node.kind==='DEVICE'&&node.bdfb)redirect(await service.buildDeepLink(node.id));
  const trail=await service.getTrail(node.id);const room=trail.find(n=>n.kind==='ROOM_SUBSTRUCTURE');const rack=trail.find(n=>n.kind==='CONTAINER_RACK');const tree=await service.buildNavigationTree(room?.id??trail[0]!.id);const view=rack ? await new RackElevationService(repo).getView(rack.id) : null;
  const links=await Promise.all(trail.map(async n=>({id:n.id,name:n.name,href:await service.buildDeepLink(n.id)})));
  const allocation=rack?.kind==='CONTAINER_RACK'?rack.cas.find(r=>r.occupantId===node.id):undefined;
  return <main className="operational-page mk-device-page"><nav className="breadcrumbs">{links.map(n=><Link key={n.id} href={n.href}>{n.name}</Link>)}</nav><div className="mk-device-layout"><aside>{tree&&<TopologyContextTree tree={tree} activeId={node.id}/>}</aside><section><h1>{node.name}</h1>{view?.ok ? <RackElevation view={view.value} focusDeviceId={node.id}/> : <p>This inventory is not placed in a rack.</p>}</section><aside className="mk-inline-inspector"><small>DEVICE</small><h2>{node.name}</h2><dl><dt>Serial</dt><dd>{node.serialNumber??'Not assigned'}</dd><dt>Category</dt><dd>{node.category??'Not specified'}</dd><dt>Rack</dt><dd>{rack?.name??'Not placed'}</dd><dt>Mount</dt><dd>{allocation?`U${allocation.mountStartU} · ${allocation.physicalSizeU}U`:'Not mounted'}</dd></dl><Link className="mk-primary" href={`/power?entity=${node.id}`}>TRACE POWER</Link>{room&&<Link href={`/blueprint/${room.id}?rack=${rack?.id??''}`}>LOCATE IN ROOM</Link>}<TelemetryLens entityIds={[node.id]} label={node.name}/></aside></div></main>;
}
