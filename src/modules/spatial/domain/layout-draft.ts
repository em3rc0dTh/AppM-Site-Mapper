import type { PointMm, RectMm } from './geometry';
import { isValidPolygon, pointInPolygon, rectInsidePolygon, rectsOverlap } from './geometry';
import { gridCoordinateToPoint } from './grid';
export interface DraftCluster { id:string; name:string; polygon:PointMm[] }
export interface DraftPosition { id:string; name:string; clusterId:string; row:string; column:number }
export interface DraftRack { id:string; name:string; positionId:string; width:number; depth:number; totalU:number }
export interface LayoutDraft { version:string; polygon:PointMm[]; clusters:DraftCluster[]; positions:DraftPosition[]; racks:DraftRack[] }
export function validateLayoutDraft(value:unknown): string | null {
 if(!value||typeof value!=='object')return 'INVALID_LAYOUT'; const d=value as LayoutDraft;
 const polygon=(p:unknown):p is PointMm[]=>Array.isArray(p)&&p.length>=3&&p.length<=256&&p.every(v=>v&&typeof v==='object'&&typeof v.x==='number'&&typeof v.y==='number'&&Math.abs(v.x)<=1000000&&Math.abs(v.y)<=1000000)&&isValidPolygon(p);
 if(typeof d.version!=='string'||!polygon(d.polygon)||!Array.isArray(d.clusters)||!Array.isArray(d.positions)||!Array.isArray(d.racks)||d.clusters.length>200||d.positions.length>2000||d.racks.length>2000)return 'INVALID_LAYOUT';
 const ids=new Set<string>();const named=(v:{id:string;name:string})=>v&&typeof v.id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v.id)&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=120&&!ids.has(v.id)&&!!ids.add(v.id);
 for(const c of d.clusters)if(!named(c)||!polygon(c.polygon)||!c.polygon.every(p=>pointInPolygon(p,d.polygon)))return 'INVALID_CLUSTER_BOUNDARY';
 const occupied=new Set<string>();const cells=new Set<string>();const rects:RectMm[]=[];
 for(const p of d.positions){if(!named(p)||typeof p.row!=='string'||!/^[A-Z]{1,3}$/.test(p.row)||!Number.isInteger(p.column)||p.column<1||p.column>1000)return 'INVALID_POSITION';const cluster=d.clusters.find(c=>c.id===p.clusterId);if(!cluster)return 'INVALID_CLUSTER';const point=gridCoordinateToPoint(p);const rect={...point,width:600,depth:600};if(!rectInsidePolygon(rect,d.polygon)||!rectInsidePolygon(rect,cluster.polygon))return 'POSITION_OUTSIDE_BOUNDARY';const cell=`${p.row}:${p.column}`;if(cells.has(cell))return 'POSITION_COLLISION';cells.add(cell);}
 for(const r of d.racks){if(!named(r)||![r.width,r.depth,r.totalU].every(Number.isInteger)||r.width<1||r.depth<1||r.width>10000||r.depth>10000||r.totalU<1||r.totalU>100)return 'INVALID_RACK';const p=d.positions.find(p=>p.id===r.positionId);if(!p)return 'INVALID_POSITION';if(occupied.has(p.id))return 'POSITION_OCCUPIED';occupied.add(p.id);const cluster=d.clusters.find(c=>c.id===p.clusterId)!;const rect={...gridCoordinateToPoint(p),width:r.width,depth:r.depth};if(!rectInsidePolygon(rect,d.polygon)||!rectInsidePolygon(rect,cluster.polygon))return 'RACK_OUTSIDE_BOUNDARY';if(rects.some(other=>rectsOverlap(rect,other)))return 'RACK_COLLISION';rects.push(rect);}
 return null;
}
