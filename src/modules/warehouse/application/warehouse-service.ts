import { validateBdfb } from '@/modules/power/domain/bdfb-validation';
import {
  materializeBdfbBlueprint,
  type AssetTemplate,
  type AssetTemplateKind,
  type PhysicalBlueprint,
  type WarehouseDeviceType,
} from '@/modules/warehouse/domain/template';
import type { WarehouseRepository } from '@/modules/warehouse/application/warehouse-repository';
import { createDomainId, nowIso } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type WarehouseError =
  | 'INVALID_NAME'
  | 'INVALID_KIND'
  | 'INVALID_SIZE_U'
  | 'INVALID_DIMENSIONS'
  | 'INVALID_DEVICE_TYPE'
  | 'INVALID_PHYSICAL_BLUEPRINT'
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
  readonly deviceType?: WarehouseDeviceType;
  readonly physicalBlueprint?: PhysicalBlueprint;
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
    if (!name) return failure('INVALID_NAME');
    if (input.kind !== 'DEVICE' && input.kind !== 'EQUIPMENT') return failure('INVALID_KIND');

    if (
      input.sizeU !== undefined &&
      (!Number.isInteger(input.sizeU) || input.sizeU < 1 || input.sizeU > 100)
    )
      return failure('INVALID_SIZE_U');

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
    )
      return failure('INVALID_DIMENSIONS');

    if (input.deviceType || input.physicalBlueprint) {
      if (input.kind !== 'DEVICE' || input.deviceType !== 'BDFB') {
        return failure('INVALID_DEVICE_TYPE');
      }
      if (!input.physicalBlueprint || input.physicalBlueprint.type !== 'BDFB') {
        return failure('INVALID_PHYSICAL_BLUEPRINT');
      }
      const validation = validateBdfb(
        materializeBdfbBlueprint(input.physicalBlueprint, 'warehouse-template-validation'),
      );
      if (!validation.ok) return failure('INVALID_PHYSICAL_BLUEPRINT');
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
    const template: AssetTemplate = {
      id: createDomainId(),
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      kind: input.kind,
      version: 1,
      name,
      ...(manufacturer ? { manufacturer } : {}),
      ...(model ? { model } : {}),
      ...(category ? { category } : {}),
      ...(input.sizeU === undefined ? {} : { sizeU: input.sizeU }),
      ...(hasWidth ? { dimensionsMm: { width: input.widthMm!, depth: input.depthMm! } } : {}),
      ...(notes ? { notes } : {}),
      ...(input.deviceType ? { deviceType: input.deviceType } : {}),
      ...(input.physicalBlueprint
        ? { physicalBlueprint: structuredClone(input.physicalBlueprint) }
        : {}),
    };

    await this.repository.insert(template);
    return success(template);
  }
}
