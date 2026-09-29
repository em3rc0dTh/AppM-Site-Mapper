import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { initializeCas } from '@/modules/rack/domain/cas';
import { validateLayoutDraft, type LayoutDraft } from '@/modules/spatial/domain/layout-draft';
export async function readLayoutDraft(repo:TopologyRepository, roomId:string):Promise<{draft:LayoutDraft;nodes:TopologyNode[]}|null> {
 const room=await repo.getById(roomId);if(!room||room.kind!=='ROOM_SUBSTRUCTURE'||room.lifecycle!=='ACTIVE')return null;
 const clusters=(await repo.listChildren(roomId)).filter(n=>n.kind==='CONTAINER_CLUSTER_BAY'&&n.lifecycle==='ACTIVE');const positions=(await Promise.all(clusters.map(c=>repo.listChildren(c.id)))).flat().filter(n=>n.kind==='POSITION'&&n.lifecycle==='ACTIVE');const racks=(await Promise.all(positions.map(p=>repo.listChildren(p.id)))).flat().filter(n=>n.kind==='CONTAINER_RACK'&&n.lifecycle==='ACTIVE');
 return {nodes:[room,...clusters,...positions,...racks],draft:{version:room.updatedAt,polygon:[...(room.polygon??[])],clusters:clusters.map(c=>({id:c.id,name:c.name,polygon:c.kind==='CONTAINER_CLUSTER_BAY'?[...(c.polygon??[])]:[]})),positions:positions.map(p=>({id:p.id,name:p.name,clusterId:p.parentId!,row:p.kind==='POSITION'?p.coordinate.row:'A',column:p.kind==='POSITION'?p.coordinate.column:1})),racks:racks.map(r=>({id:r.id,name:r.name,positionId:r.parentId!,width:r.kind==='CONTAINER_RACK'?r.dimensionsMm?.width??600:600,depth:r.kind==='CONTAINER_RACK'?r.dimensionsMm?.depth??600:600,totalU:r.kind==='CONTAINER_RACK'?r.totalU??42:42}))}};
}
export async function prepareLayoutSave(repo:TopologyRepository,roomId:string,input:unknown):Promise<{error:string}|{before:TopologyNode[];after:TopologyNode[]}> {
 const error=validateLayoutDraft(input);if(error)return {error};const draft=input as LayoutDraft;const current=await readLayoutDraft(repo,roomId);if(!current)return {error:'ROOM_NOT_FOUND'};if(current.draft.version!==draft.version)return {error:'LAYOUT_CONFLICT'};
 const original=new Map(current.nodes.map(n=>[n.id,n]));const now=new Date(Math.max(Date.now(),Date.parse(draft.version)+1)).toISOString();
 const requested=[...draft.clusters,...draft.positions,...draft.racks];for(const n of requested)if(!original.has(n.id)&&await repo.getById(n.id))return {error:'ID_ALREADY_EXISTS'};
 for(const old of current.nodes){if(old.id===roomId||requested.some(n=>n.id===old.id))continue;if(old.kind==='CONTAINER_RACK'&&((await repo.listChildren(old.id)).some(n=>n.lifecycle==='ACTIVE')||old.cas.some(r=>r.state!=='AVAILABLE')))return {error:'RACK_NOT_EMPTY'};}
 for(const r of draft.racks){const old=original.get(r.id);if(old&&old.kind!=='CONTAINER_RACK')return {error:'KIND_CHANGE_FORBIDDEN'};if(old?.kind==='CONTAINER_RACK'){if(old.totalU!==r.totalU)return {error:'RACK_CAPACITY_CHANGE_REQUIRES_CAS_MIGRATION'};const oldPosition=original.get(old.parentId??'');const destination=draft.positions.find(p=>p.id===r.positionId);if(oldPosition?.kind==='POSITION'&&destination&&oldPosition.parentId!==destination.clusterId)return {error:'RACK_BAY_REASSIGNMENT_FORBIDDEN'};}}
 const base=(id:string,name:string)=>({id,name:name.trim(),lifecycle:'ACTIVE' as const,createdAt:original.get(id)?.createdAt??now,updatedAt:now});
 const room=current.nodes[0]!;const after:TopologyNode[]=[{...room,polygon:draft.polygon,updatedAt:now} as TopologyNode];
 for(const c of draft.clusters){const old=original.get(c.id);if(old&&old.kind!=='CONTAINER_CLUSTER_BAY')return {error:'KIND_CHANGE_FORBIDDEN'};after.push({...old,...base(c.id,c.name),kind:'CONTAINER_CLUSTER_BAY',variant:'BAY',parentId:roomId,polygon:c.polygon});}
 for(const p of draft.positions){const old=original.get(p.id);if(old&&old.kind!=='POSITION')return {error:'KIND_CHANGE_FORBIDDEN'};if(old?.kind==='POSITION'&&old.parentId!==p.clusterId)return {error:'POSITION_REASSIGNMENT_FORBIDDEN'};after.push({...old,...base(p.id,p.name),kind:'POSITION',parentId:p.clusterId,coordinate:{row:p.row,column:p.column}});}
 for(const r of draft.racks){const old=original.get(r.id);after.push({...old,...base(r.id,r.name),kind:'CONTAINER_RACK',variant:'RACK',parentId:r.positionId,dimensionsMm:{width:r.width,depth:r.depth},totalU:r.totalU,cas:old?.kind==='CONTAINER_RACK'?old.cas:initializeCas(r.totalU)});}
 for(const old of current.nodes)if(!after.some(n=>n.id===old.id))after.push({...old,lifecycle:'ARCHIVED',updatedAt:now});
 return {before:current.nodes,after};
}
