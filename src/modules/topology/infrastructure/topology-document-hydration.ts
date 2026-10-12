import type { TopologyNode } from '@/modules/topology/domain/entities';

/**
 * Backward-compatible read mapping for persisted topology records predating
 * canonical Device/Equipment composition and Access Ports.
 *
 * Missing fields can safely default to empty collections. Present but malformed
 * fields must not be silently replaced, as that could hide lost real data.
 */
export function hydrateTopologyDocument(document: Record<string, unknown>): TopologyNode {
  const node = { ...document };
  if (node.kind === 'EQUIPMENT') {
    if (node.accessPorts === undefined || node.accessPorts === null) node.accessPorts = [];
    if (node.children === undefined || node.children === null) node.children = [];
    if (!Array.isArray(node.accessPorts) || !Array.isArray(node.children)) {
      throw new Error('INVALID_EQUIPMENT_COLLECTIONS: ' + String(node.id ?? 'unknown'));
    }
  }
  if (node.kind === 'DEVICE') {
    if (node.rootEquipmentIds === undefined || node.rootEquipmentIds === null) {
      node.rootEquipmentIds = [];
    }
    if (!Array.isArray(node.rootEquipmentIds)) {
      throw new Error('INVALID_DEVICE_ROOT_EQUIPMENT_IDS: ' + String(node.id ?? 'unknown'));
    }
  }
  return node as unknown as TopologyNode;
}
