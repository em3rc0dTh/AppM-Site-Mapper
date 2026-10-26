import type { Document } from 'mongodb';

/** Pure preflight used by migration commands. Reports conflicts without repair. */
export function canonicalIntegrityErrors(nodes: readonly Document[], paths: readonly Document[], bindings: readonly Document[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, Document>();
  const ports = new Map<string, { owner: Document; port: Document }>();
  const unique = new Map<string, string>();
  const owners = new Map<string, string>();
  const claim = (key: string, id: string) => {
    const prior = unique.get(key);
    if (prior !== undefined) errors.push(`DUPLICATE:${key}:${prior}:${id}`);
    else unique.set(key, id);
  };
  for (const node of nodes) {
    if (typeof node.id !== 'string' || !node.id || typeof node.name !== 'string' || !node.name.trim() ||
        !['ACTIVE', 'ARCHIVED'].includes(node.lifecycle) || !Number.isFinite(Date.parse(node.createdAt)) || !Number.isFinite(Date.parse(node.updatedAt)) ||
        (node.revision !== undefined && (!Number.isSafeInteger(node.revision) || node.revision < 1))) errors.push(`INVALID_NODE:${node.id}`);
    claim(`id:${node.id}`, node.id);
    byId.set(node.id, node);
    if (node.kind === 'CONTAINER_RACK' && node.lifecycle === 'ACTIVE') claim(`rack-position:${node.parentId}`, node.id);
    if (['DEVICE', 'EQUIPMENT'].includes(node.kind) && node.lifecycle === 'ACTIVE' && typeof node.serialNumber === 'string') claim(`publisher:${node.serialNumber}`, node.id);
    if (node.kind === 'DEVICE' && !Array.isArray(node.rootEquipmentIds)) errors.push(`INVALID_DEVICE_ARRAY:${node.id}`);
    if (node.kind === 'CONTAINER_RACK' && !Array.isArray(node.cas)) errors.push(`INVALID_CAS_ARRAY:${node.id}`);
    if (node.kind === 'EQUIPMENT') {
      if (!Array.isArray(node.accessPorts) || !Array.isArray(node.children)) { errors.push(`INVALID_EQUIPMENT_ARRAYS:${node.id}`); continue; }
      for (const port of node.accessPorts) {
        if (!port || typeof port.id !== 'string' || port.equipmentId !== node.id || port.deviceId !== node.deviceId || !['ACTIVE','ARCHIVED'].includes(port.lifecycle)) { errors.push(`INVALID_PORT:${node.id}`); continue; }
        claim(`port:${port.id}`, node.id);
        ports.set(port.id, { owner: node, port });
      }
    }
  }
  const active = (id: string) => {
    const seen = new Set<string>();
    let node = byId.get(id);
    if (!node) return false;
    while (node) {
      if (node.lifecycle !== 'ACTIVE' || seen.has(node.id)) return false;
      seen.add(node.id);
      if (node.parentId === null) return node.kind === 'NETWORK';
      node = byId.get(node.parentId);
      if (!node) return false;
    }
    return false;
  };
  const parentKinds: Record<string, string[]> = { NETWORK: [], SITE: ['NETWORK'], STRUCTURE: ['SITE'], LEVEL: ['STRUCTURE'], ROOM_SUBSTRUCTURE: ['LEVEL'], CONTAINER_CLUSTER_BAY: ['ROOM_SUBSTRUCTURE'], POSITION: ['CONTAINER_CLUSTER_BAY'], CONTAINER_RACK: ['POSITION'], DEVICE: ['CONTAINER_RACK'], EQUIPMENT: ['DEVICE', 'EQUIPMENT'] };
  for (const node of nodes) {
    const parent = byId.get(node.parentId);
    if (!parentKinds[node.kind] || (node.kind === 'NETWORK' ? node.parentId !== null : !parent || !parentKinds[node.kind]!.includes(parent.kind))) errors.push(`INVALID_PARENT:${node.id}`);
    if (node.lifecycle === 'ACTIVE' && !active(node.id)) errors.push(`INACTIVE_ANCESTRY:${node.id}`);
    if (node.kind === 'EQUIPMENT') {
      const device = byId.get(node.deviceId);
      if (device?.kind !== 'DEVICE' || (node.parentEquipmentId === null ? parent?.id !== node.deviceId || !parent?.rootEquipmentIds?.includes(node.id) : parent?.id !== node.parentEquipmentId || parent?.deviceId !== node.deviceId || !parent?.children?.includes(node.id))) errors.push(`INVALID_EQUIPMENT_OWNERSHIP:${node.id}`);
      if (node.rackPlacement) {
        const rack = byId.get(node.rackPlacement.rackId);
        if (!rack || !active(rack.id) || !rack.cas?.some((range: Document) => range.occupantId === node.id)) errors.push(`INVALID_CAS_REFERENCE:${node.id}`);
      }
      if (Array.isArray(node.children)) for (const id of node.children) {
        if (id !== null && (byId.get(id)?.parentEquipmentId !== node.id || byId.get(id)?.deviceId !== node.deviceId)) errors.push(`INVALID_CHILD:${node.id}:${id}`);
      }
    }
  }
  for (const path of paths) {
    if (path.lifecycle !== 'ACTIVE') continue;
    for (const key of ['sourceAccessPortId', 'targetAccessPortId']) {
      const found = ports.get(path[key]);
      if (!found || found.port.lifecycle !== 'ACTIVE' || found.port.portType !== 'POWER' || found.port.exposure !== 'EXTERNAL' || !active(found.owner.id)) errors.push(`ORPHAN_POWER_PATH:${path.id}:${key}`);
      claim(`power:${key}:${path[key]}`, path.id);
    }
  }
  for (const binding of bindings) {
    if (binding.lifecycle !== 'ACTIVE') continue;
    const target = binding.targetType === 'ACCESS_PORT' ? ports.get(binding.targetId)?.owner : byId.get(binding.targetId);
    if (!['DEVICE', 'EQUIPMENT', 'ACCESS_PORT'].includes(binding.targetType) || !target || !active(target.id) || (binding.targetType !== 'ACCESS_PORT' && target.kind !== binding.targetType) || (binding.targetType === 'ACCESS_PORT' && ports.get(binding.targetId)?.port.lifecycle !== 'ACTIVE')) errors.push(`ORPHAN_TELEMETRY_BINDING:${binding.id}`);
    const ownerKey = JSON.stringify([binding.protocol, binding.targetType, binding.targetId]);
    if (owners.has(ownerKey) && owners.get(ownerKey) !== binding.sourceIdentity) errors.push(`BINDING_OWNER_CONFLICT:${binding.id}`);
    owners.set(ownerKey, binding.sourceIdentity);
    claim(`binding-source:${JSON.stringify([binding.protocol, binding.sourceIdentity, binding.sourcePointId ?? null, binding.metric])}`, binding.id);
    claim(`binding-target:${JSON.stringify([binding.targetType, binding.targetId, binding.metric])}`, binding.id);
  }
  return errors;
}
