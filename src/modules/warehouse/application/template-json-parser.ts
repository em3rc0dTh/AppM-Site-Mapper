import type { CreateAssetTemplateInput } from '@/modules/warehouse/application/warehouse-service';
import type { EquipmentType } from '@/modules/topology/domain/entities';
import {
  parseEquipmentChildMode,
  parseEquipmentType,
} from '@/modules/topology/domain/type-parsers';
import { hasOnlyKeys, isBoundedString } from '@/shared/http/request-security';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function allowedChildTypes(value: unknown): readonly EquipmentType[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 32) return undefined;
  const parsed = value.map(parseEquipmentType);
  if (parsed.some((item) => item === undefined)) return undefined;
  return parsed as EquipmentType[];
}

export function parseAssetTemplateJson(value: unknown): CreateAssetTemplateInput | null {
  const body = object(value);
  if (
    !body ||
    !hasOnlyKeys(body, [
      'kind',
      'name',
      'manufacturer',
      'model',
      'category',
      'sizeU',
      'dimensionsMm',
      'widthMm',
      'depthMm',
      'notes',
      'equipmentType',
      'childMode',
      'childCapacity',
      'allowedChildTypes',
    ]) ||
    body.kind !== 'EQUIPMENT' ||
    !isBoundedString(body.name, 120) ||
    (body.manufacturer !== undefined &&
      !isBoundedString(body.manufacturer, 120, { allowEmpty: true })) ||
    (body.model !== undefined && !isBoundedString(body.model, 120, { allowEmpty: true })) ||
    (body.category !== undefined && !isBoundedString(body.category, 120, { allowEmpty: true })) ||
    (body.notes !== undefined && !isBoundedString(body.notes, 500, { allowEmpty: true }))
  ) {
    return null;
  }

  const dimensions = object(body.dimensionsMm);
  const widthMm = number(body.widthMm) ?? (dimensions ? number(dimensions.width) : undefined);
  const depthMm = number(body.depthMm) ?? (dimensions ? number(dimensions.depth) : undefined);
  const parsedEquipmentType =
    body.equipmentType === undefined ? undefined : parseEquipmentType(body.equipmentType);
  const parsedChildMode =
    body.childMode === undefined ? undefined : parseEquipmentChildMode(body.childMode);
  const parsedAllowed =
    body.allowedChildTypes === undefined ? undefined : allowedChildTypes(body.allowedChildTypes);

  if (body.equipmentType !== undefined && !parsedEquipmentType) return null;
  if (body.childMode !== undefined && !parsedChildMode) return null;
  if (body.allowedChildTypes !== undefined && !parsedAllowed) return null;

  return {
    kind: 'EQUIPMENT',
    name: body.name,
    ...(string(body.manufacturer) !== undefined
      ? { manufacturer: string(body.manufacturer)! }
      : {}),
    ...(string(body.model) !== undefined ? { model: string(body.model)! } : {}),
    ...(string(body.category) !== undefined ? { category: string(body.category)! } : {}),
    ...(number(body.sizeU) !== undefined ? { sizeU: number(body.sizeU)! } : {}),
    ...(widthMm !== undefined ? { widthMm } : {}),
    ...(depthMm !== undefined ? { depthMm } : {}),
    ...(string(body.notes) !== undefined ? { notes: string(body.notes)! } : {}),
    ...(parsedEquipmentType ? { equipmentType: parsedEquipmentType } : {}),
    ...(parsedChildMode ? { childMode: parsedChildMode } : {}),
    ...(number(body.childCapacity) !== undefined
      ? { childCapacity: number(body.childCapacity)! }
      : {}),
    ...(parsedAllowed ? { allowedChildTypes: parsedAllowed } : {}),
  };
}
