import type { TopologyNode } from '@/modules/topology/domain/entities';

/**
 * Operational presentation policy, NOT an authorization policy.
 *
 * Existing seed-01 v8 databases already contain these integration assets.
 * Classify them without deleting, renaming or migrating their identities.
 * The explicit metadata flag lets future seeds opt into the same policy.
 */
const SEED01_TECHNICAL_EQUIPMENT = /^(QDF-(?:2|4|5))_(?:CTRL-1|GW-1|METER-(?:A2|A3|B2|B3))$/;

export function isInternalEquipment(node: TopologyNode): boolean {
  if (node.kind !== 'EQUIPMENT') return false;
  if (node.attributes?.visibility === 'INTERNAL') return true;
  if (!SEED01_TECHNICAL_EQUIPMENT.test(node.name)) return false;

  if (node.name.endsWith('_CTRL-1')) return node.equipmentType === 'CONTROLLER_BOARD';
  if (node.name.endsWith('_GW-1')) return node.equipmentType === 'NETWORK_BOARD';
  return node.equipmentType === 'CUSTOM' && node.model === 'AMC16Z-FDK24';
}

/** Use only for customer-facing navigation/search/inventory projections. */
export function isOperationallyVisible(node: TopologyNode): boolean {
  return !isInternalEquipment(node);
}
