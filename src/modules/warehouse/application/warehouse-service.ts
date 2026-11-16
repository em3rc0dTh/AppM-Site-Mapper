import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import type {
  EquipmentChildMode,
  EquipmentType,
  EquipmentPresentation,
} from '@/modules/topology/domain/entities';
import { type AssetTemplate, type AssetTemplateKind } from '@/modules/warehouse/domain/template';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type WarehouseError =
  | 'INVALID_NAME'
  | 'INVALID_TEXT_FIELD'
  | 'INVALID_KIND'
  | 'INVALID_SIZE_U'
  | 'INVALID_DIMENSIONS'
  | 'INVALID_CHILD_CAPACITY'
  | 'INVALID_EQUIPMENT_PRESENTATION'
  | 'DUPLICATE_TEMPLATE';

export interface CreateAssetTemplateInput {
  readonly kind: AssetTemplateKind;
  readonly name: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly category?: string;
  readonly sizeU?: number;
  readonly widthMm?: number;
  readonly depthMm?: number;
  readonly notes?: string;
  readonly equipmentType?: EquipmentType;
  readonly childMode?: EquipmentChildMode;
  readonly childCapacity?: number;
  readonly allowedChildTypes?: readonly EquipmentType[];
  readonly presentation?: EquipmentPresentation;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export class WarehouseService {
  constructor(private readonly repository: WarehouseRepository) {}

  async listActive(): Promise<readonly AssetTemplate[]> {
    return this.repository.listActive();
  }

  async getById(id: string): Promise<AssetTemplate | null> {
    const template = await this.repository.getById(id);
    return template?.lifecycle === 'ACTIVE' ? template : null;
  }

  async create(input: CreateAssetTemplateInput): Promise<Result<AssetTemplate, WarehouseError>> {
    const name = input.name.trim();
    if (!name || name.length > 120) return failure('INVALID_NAME');
    if (input.kind !== 'EQUIPMENT') return failure('INVALID_KIND');

    for (const value of [input.manufacturer, input.model, input.category]) {
      if (value !== undefined && value.length > 120) {
        return failure('INVALID_TEXT_FIELD');
      }
    }
    if (input.notes !== undefined && input.notes.length > 500) {
      return failure('INVALID_TEXT_FIELD');
    }
    if ((input.allowedChildTypes?.length ?? 0) > 32) {
      return failure('INVALID_TEXT_FIELD');
    }

    if (
      input.sizeU !== undefined &&
      (!Number.isInteger(input.sizeU) || input.sizeU < 1 || input.sizeU > 100)
    ) {
      return failure('INVALID_SIZE_U');
    }

    const childMode = input.childMode ?? 'DYNAMIC';
    if (
      childMode === 'POSITIONAL' &&
      (!Number.isInteger(input.childCapacity) ||
        (input.childCapacity ?? 0) < 1 ||
        (input.childCapacity ?? 0) > 256)
    ) {
      return failure('INVALID_CHILD_CAPACITY');
    }
    if (childMode === 'DYNAMIC' && input.childCapacity !== undefined && input.childCapacity !== 0) {
      return failure('INVALID_CHILD_CAPACITY');
    }

    if (
      input.presentation &&
      (!['ROW', 'COLUMN'].includes(input.presentation.direction) ||
        !(
          input.presentation.maxPerLine === null ||
          (Number.isInteger(input.presentation.maxPerLine) &&
            input.presentation.maxPerLine >= 1 &&
            input.presentation.maxPerLine <= 256)
        ) ||
        !['AUTO', 'INLINE', 'SUMMARY'].includes(input.presentation.childrenVisibility))
    )
      return failure('INVALID_EQUIPMENT_PRESENTATION');

    const hasWidth = input.widthMm !== undefined;
    const hasDepth = input.depthMm !== undefined;
    if (
      hasWidth !== hasDepth ||
      (hasWidth &&
        (!Number.isInteger(input.widthMm) ||
          !Number.isInteger(input.depthMm) ||
          (input.widthMm ?? 0) < 1 ||
          (input.depthMm ?? 0) < 1 ||
          (input.widthMm ?? 0) > 10000 ||
          (input.depthMm ?? 0) > 10000))
    ) {
      return failure('INVALID_DIMENSIONS');
    }

    const existing = await this.repository.listActive();
    const duplicate = existing.some(
      (template) =>
        template.kind === input.kind &&
        template.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (duplicate) return failure('DUPLICATE_TEMPLATE');

    const timestamp = nowIso();
    const manufacturer = clean(input.manufacturer);
    const model = clean(input.model);
    const category = clean(input.category);
    const notes = clean(input.notes);
    const allowedChildTypes = [...new Set(input.allowedChildTypes ?? [])];

    const template: AssetTemplate = {
      id: createDomainId(),
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      kind: 'EQUIPMENT',
      version: 1,
      name,
      ...(manufacturer ? { manufacturer } : {}),
      ...(model ? { model } : {}),
      ...(category ? { category } : {}),
      ...(input.sizeU === undefined ? {} : { sizeU: input.sizeU }),
      ...(hasWidth ? { dimensionsMm: { width: input.widthMm!, depth: input.depthMm! } } : {}),
      ...(notes ? { notes } : {}),
      ...(input.equipmentType ? { equipmentType: input.equipmentType } : {}),
      childMode,
      ...(childMode === 'POSITIONAL' ? { childCapacity: input.childCapacity! } : {}),
      ...(allowedChildTypes.length ? { allowedChildTypes } : {}),
      ...(input.presentation ? { presentation: { ...input.presentation } } : {}),
    };

    await this.repository.insert(template);
    return success(template);
  }
}
