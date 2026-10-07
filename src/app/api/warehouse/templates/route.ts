import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import type {
  EquipmentChildMode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import type { AssetTemplateKind } from '@/modules/warehouse/domain/template';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
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

export async function GET() {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const templates = await new WarehouseService(await createWarehouseRepository()).listActive();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = object(await request.json().catch(() => null));
  const kind = body?.kind === 'EQUIPMENT' ? (body.kind as AssetTemplateKind) : null;

  if (!body || !kind || typeof body.name !== 'string')
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const result = await new WarehouseService(await createWarehouseRepository()).create({
    kind,
    name: body.name,
    ...(typeof body.manufacturer === 'string' ? { manufacturer: body.manufacturer } : {}),
    ...(typeof body.model === 'string' ? { model: body.model } : {}),
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
    ...(typeof body.sizeU === 'number' ? { sizeU: body.sizeU } : {}),
    ...(typeof body.widthMm === 'number' ? { widthMm: body.widthMm } : {}),
    ...(typeof body.depthMm === 'number' ? { depthMm: body.depthMm } : {}),
    ...(typeof body.notes === 'string' ? { notes: body.notes } : {}),
    ...(equipmentType(body.equipmentType)
      ? { equipmentType: equipmentType(body.equipmentType)! }
      : {}),
    ...(childMode(body.childMode) ? { childMode: childMode(body.childMode)! } : {}),
    ...(typeof body.childCapacity === 'number'
      ? { childCapacity: body.childCapacity }
      : {}),
    ...(allowedChildTypes(body.allowedChildTypes)
      ? { allowedChildTypes: allowedChildTypes(body.allowedChildTypes)! }
      : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ template: result.value }, { status: 201 });
}
