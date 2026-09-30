import type { DomainEntity } from '@/shared/domain/entity';
import type { DimensionsMm } from '@/modules/topology/domain/entities';

export type AssetTemplateKind = 'DEVICE' | 'EQUIPMENT';

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
  };
}
