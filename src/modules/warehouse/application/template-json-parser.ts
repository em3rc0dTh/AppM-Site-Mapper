import type { CreateAssetTemplateInput } from '@/modules/warehouse/application/warehouse-service';
import type {
  EquipmentChildMode,
  EquipmentType,
} from '@/modules/topology/domain/entities';

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

const equipmentTypes = new Set<EquipmentType>([
  'CHASSIS',
  'SHELF',
  'SUB_SHELF',
  'FRAME',
  'PANEL',
  'CIRCUIT_BREAKER',
  'POWER_SUPPLY',
  'POWER_MODULE',
  'CONTROLLER_BOARD',
  'NETWORK_BOARD',
  'PLUGGABLE_MODULE',
  'FAN',
  'CUSTOM',
]);

function equipmentType(value: unknown): EquipmentType | undefined {
  return typeof value === 'string' && equipmentTypes.has(value as EquipmentType)
    ? (value as EquipmentType)
    : undefined;
}

function childMode(value: unknown): EquipmentChildMode | undefined {
  return value === 'DYNAMIC' || value === 'POSITIONAL' ? value : undefined;
}

function allowedChildTypes(value: unknown): readonly EquipmentType[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(equipmentType);
  if (parsed.some((item) => item === undefined)) return undefined;
  return parsed as EquipmentType[];
}

export function parseAssetTemplateJson(value: unknown): CreateAssetTemplateInput | null {
  const body = object(value);
  if (!body || body.kind !== 'EQUIPMENT' || typeof body.name !== 'string') return null;

  const dimensions = object(body.dimensionsMm);
  const widthMm = number(body.widthMm) ?? (dimensions ? number(dimensions.width) : undefined);
  const depthMm = number(body.depthMm) ?? (dimensions ? number(dimensions.depth) : undefined);
  const parsedEquipmentType =
    body.equipmentType === undefined ? undefined : equipmentType(body.equipmentType);
  const parsedChildMode = body.childMode === undefined ? undefined : childMode(body.childMode);
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
