import type {
  DimensionsMm,
  EquipmentChildMode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import type { DomainEntity } from '@/shared/domain/entity';

export type AssetTemplateKind = 'EQUIPMENT';

export interface AssetTemplate extends DomainEntity {
  readonly kind: AssetTemplateKind;
  readonly version: number;
  readonly name: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly category?: string;
  readonly sizeU?: number;
  readonly dimensionsMm?: DimensionsMm;
  readonly notes?: string;
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  /**
   * For POSITIONAL Equipment this is the number of physical child slots.
   * DYNAMIC Equipment does not use a fixed capacity.
   */
  readonly childCapacity?: number;
  /**
   * Optional template-level guard. Runtime hierarchy remains Equipment-recursive;
   * this only restricts which Equipment types may occupy this template's children.
   */
  readonly allowedChildTypes?: readonly EquipmentType[];
}

export interface AssetTemplateSnapshot {
  readonly templateId: string;
  readonly templateVersion: number;
  readonly templateName: string;
  readonly kind: AssetTemplateKind;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly category?: string;
  readonly sizeU?: number;
  readonly dimensionsMm?: DimensionsMm;
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  readonly childCapacity?: number;
  readonly allowedChildTypes?: readonly EquipmentType[];
}

export function snapshotTemplate(template: AssetTemplate): AssetTemplateSnapshot {
  return {
    templateId: template.id,
    templateVersion: template.version,
    templateName: template.name,
    kind: template.kind,
    ...(template.manufacturer ? { manufacturer: template.manufacturer } : {}),
    ...(template.model ? { model: template.model } : {}),
    ...(template.category ? { category: template.category } : {}),
    ...(template.sizeU === undefined ? {} : { sizeU: template.sizeU }),
    ...(template.dimensionsMm ? { dimensionsMm: template.dimensionsMm } : {}),
    ...(template.equipmentType ? { equipmentType: template.equipmentType } : {}),
    ...(template.childMode ? { childMode: template.childMode } : {}),
    ...(template.childCapacity === undefined ? {} : { childCapacity: template.childCapacity }),
    ...(template.allowedChildTypes?.length
      ? { allowedChildTypes: [...template.allowedChildTypes] }
      : {}),
  };
}
