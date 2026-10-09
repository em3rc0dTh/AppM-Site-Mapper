import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import type { EquipmentType } from '@/modules/topology/domain/entities';
import {
  parseEquipmentChildMode,
  parseEquipmentType,
} from '@/modules/topology/domain/type-parsers';
import type { AssetTemplateKind } from '@/modules/warehouse/domain/template';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function allowedChildTypes(value: unknown): readonly EquipmentType[] | undefined {
  if (!Array.isArray(value) || value.length > 32) return undefined;
  const parsed = value.map(parseEquipmentType);
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

  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  }

  const parsed = await readBoundedJson(request, {
    maxBytes: 32_768,
    maxDepth: 8,
    maxNodes: 256,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  }

  const body = object(parsed.value);
  const kind = body?.kind === 'EQUIPMENT' ? (body.kind as AssetTemplateKind) : null;

  if (
    !body ||
    !hasOnlyKeys(body, [
      'kind',
      'name',
      'manufacturer',
      'model',
      'category',
      'sizeU',
      'widthMm',
      'depthMm',
      'notes',
      'equipmentType',
      'childMode',
      'childCapacity',
      'allowedChildTypes',
      'presentation',
    ]) ||
    !kind ||
    !isBoundedString(body.name, 120) ||
    (body.manufacturer !== undefined &&
      !isBoundedString(body.manufacturer, 120, { allowEmpty: true })) ||
    (body.model !== undefined && !isBoundedString(body.model, 120, { allowEmpty: true })) ||
    (body.category !== undefined && !isBoundedString(body.category, 120, { allowEmpty: true })) ||
    (body.notes !== undefined && !isBoundedString(body.notes, 500, { allowEmpty: true })) ||
    (body.equipmentType !== undefined && !parseEquipmentType(body.equipmentType)) ||
    (body.childMode !== undefined && !parseEquipmentChildMode(body.childMode)) ||
    (body.childCapacity !== undefined && !Number.isInteger(body.childCapacity)) ||
    (body.presentation !== undefined &&
      (!object(body.presentation) ||
        !hasOnlyKeys(object(body.presentation)!, [
          'direction',
          'maxPerLine',
          'childrenVisibility',
        ]) ||
        !['ROW', 'COLUMN'].includes(object(body.presentation)!.direction as string) ||
        !['AUTO', 'INLINE', 'SUMMARY'].includes(
          object(body.presentation)!.childrenVisibility as string,
        ) ||
        !(
          object(body.presentation)!.maxPerLine === null ||
          (Number.isInteger(object(body.presentation)!.maxPerLine) &&
            (object(body.presentation)!.maxPerLine as number) >= 1 &&
            (object(body.presentation)!.maxPerLine as number) <= 256)
        ))) ||
    (body.allowedChildTypes !== undefined &&
      (!Array.isArray(body.allowedChildTypes) ||
        body.allowedChildTypes.length > 32 ||
        body.allowedChildTypes.some((item) => !parseEquipmentType(item))))
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

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
    ...(parseEquipmentType(body.equipmentType)
      ? { equipmentType: parseEquipmentType(body.equipmentType)! }
      : {}),
    ...(parseEquipmentChildMode(body.childMode)
      ? { childMode: parseEquipmentChildMode(body.childMode)! }
      : {}),
    ...(typeof body.childCapacity === 'number' ? { childCapacity: body.childCapacity } : {}),
    ...(body.presentation
      ? {
          presentation: body.presentation as {
            direction: 'ROW' | 'COLUMN';
            maxPerLine: number | null;
            childrenVisibility: 'AUTO' | 'INLINE' | 'SUMMARY';
          },
        }
      : {}),
    ...(allowedChildTypes(body.allowedChildTypes)
      ? { allowedChildTypes: allowedChildTypes(body.allowedChildTypes)! }
      : {}),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json({ template: result.value }, { status: 201 });
}
