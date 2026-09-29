import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { RackElevation } from '@/components/rack/rack-elevation';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
export default async function RackFocus({params}: {params:Promise<{rackId:string}>}) {
 const auth=await requirePermission('topology:read');if(!auth.ok)redirect('/login');const {rackId}=await params;const repo=await createTopologyRepository();const topology=new TopologyService(repo);const view=await new RackElevationService(repo).getView(rackId);if(!view.ok)notFound();
 const trail=await topology.getTrail(rackId);const room=trail.find(n=>n.kind==='ROOM_SUBSTRUCTURE');const layout=room?await new SpatialService(repo).getRoomLayout(room.id):null;const racks=layout?.ok?layout.value.racks:[];const index=racks.findIndex(r=>r.id===rackId);const nearby=racks.slice(Math.max(0,index-2),index+3);
 return <main className="mk-rack-focus"><nav className="breadcrumbs"><Link href="/network">Network</Link>{room&&<Link href={`/blueprint/${room.id}`}>{room.name}</Link>}<span>{view.value.rack.name}</span></nav><h1>RACK FOCUS · {view.value.rack.name}</h1><nav className="mk-rack-actions"><Link href={`/rack/${rackId}`}>ELEVATION</Link><Link href={`/power?entity=${rackId}`}>POWER</Link>{room&&<Link href={`/blueprint/${room.id}?rack=${rackId}`}>LOCATE</Link>}</nav><div className="mk-neighbor-racks">{nearby.map(r=><Link className={r.id===rackId?'is-selected':''} key={r.id} href={`/rack/${r.id}/focus`}><span aria-hidden="true">▤</span><strong>{r.name}</strong></Link>)}</div><TelemetryLens label={view.value.rack.name} entityIds={view.value.inventory.map(i=>i.id)}/><RackElevation view={view.value}/></main>;
}
