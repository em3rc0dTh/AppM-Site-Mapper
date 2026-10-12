import type { EquipmentType } from '@/modules/topology/domain/entities';
import { EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';

/**
 * Installed parent Equipment is authoritative for which child Equipment types
 * it accepts. Child slot count and presentation remain instance-level choices.
 */
export function allowedChildEquipmentTypes(
  allowed: readonly EquipmentType[],
): readonly EquipmentType[] {
  return allowed.length
    ? EQUIPMENT_TYPES.filter((type) => allowed.includes(type))
    : EQUIPMENT_TYPES;
}

export function canInstallChildType(
  allowed: readonly EquipmentType[],
  type: EquipmentType,
): boolean {
  return !allowed.length || allowed.includes(type);
}
