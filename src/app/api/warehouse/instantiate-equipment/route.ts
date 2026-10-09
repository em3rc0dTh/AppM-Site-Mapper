import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import {
  parseEquipmentChildMode,
  parseEquipmentType,
} from '@/modules/topology/domain/type-parsers';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
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

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  if (!isSafeMutationRequest(request)) {
    return NextResponse.json({ error: 'CROSS_SITE_MUTATION_REJECTED' }, { status: 403 });
  }

  const parsed = await readBoundedJson(request, {
    maxBytes: 16_384,
    maxDepth: 6,
    maxNodes: 128,
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  }

  const body = object(parsed.value);
  if (
    !body ||
    !hasOnlyKeys(body, [
      'templateId',
      'parentEquipmentId',
      'slotIndex',
      'name',
      'serialNumber',
      'category',
      'equipmentType',
      'childMode',
      'childCapacity',
      'presentation',
    ]) ||
    !isBoundedString(body.templateId, 160) ||
    !isBoundedString(body.parentEquipmentId, 160) ||
    (body.slotIndex !== undefined && !Number.isInteger(body.slotIndex)) ||
    (body.name !== undefined && !isBoundedString(body.name, 120, { allowEmpty: true })) ||
    (body.serialNumber !== undefined &&
      !isBoundedString(body.serialNumber, 120, { allowEmpty: true })) ||
    (body.category !== undefined && !isBoundedString(body.category, 120, { allowEmpty: true })) ||
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
        )))
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await new WarehouseInstantiationService(
    await createWarehouseRepository(),
    await createTopologyRepository(),
  ).instantiateChild({
    templateId: body.templateId,
    parentEquipmentId: body.parentEquipmentId,
    ...(typeof body.slotIndex === 'number' ? { slotIndex: body.slotIndex } : {}),
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.serialNumber === 'string' ? { serialNumber: body.serialNumber } : {}),
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
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
  });

  if (!result.ok) {
    const status =
      result.error === 'TEMPLATE_NOT_FOUND' || result.error === 'PARENT_EQUIPMENT_NOT_FOUND'
        ? 404
        : result.error === 'SERIAL_ALREADY_ASSIGNED' ||
            result.error === 'SLOT_OCCUPIED' ||
            result.error === 'LAYOUT_CONFLICT'
          ? 409
          : 422;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ equipment: result.value }, { status: 201 });
}
