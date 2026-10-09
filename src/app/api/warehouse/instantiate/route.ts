import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';
import {
  parseDeviceType,
  parseEquipmentChildMode,
  parseEquipmentType,
} from '@/modules/topology/domain/type-parsers';

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
      'rackId',
      'name',
      'serialNumber',
      'category',
      'deviceType',
      'equipmentType',
      'childMode',
      'childCapacity',
    ]) ||
    !isBoundedString(body.templateId, 160) ||
    !isBoundedString(body.rackId, 160) ||
    !isBoundedString(body.name, 120) ||
    (body.serialNumber !== undefined &&
      !isBoundedString(body.serialNumber, 120, { allowEmpty: true })) ||
    (body.category !== undefined && !isBoundedString(body.category, 120, { allowEmpty: true })) ||
    (body.deviceType !== undefined && !parseDeviceType(body.deviceType)) ||
    (body.equipmentType !== undefined && !parseEquipmentType(body.equipmentType)) ||
    (body.childMode !== undefined && !parseEquipmentChildMode(body.childMode)) ||
    (body.childCapacity !== undefined && !Number.isInteger(body.childCapacity))
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const result = await new WarehouseInstantiationService(
    await createWarehouseRepository(),
    await createTopologyRepository(),
  ).instantiate({
    templateId: body.templateId,
    rackId: body.rackId,
    name: body.name,
    ...(typeof body.serialNumber === 'string' ? { serialNumber: body.serialNumber } : {}),
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
    ...(parseDeviceType(body.deviceType) ? { deviceType: parseDeviceType(body.deviceType)! } : {}),
    ...(parseEquipmentType(body.equipmentType)
      ? { equipmentType: parseEquipmentType(body.equipmentType)! }
      : {}),
    ...(parseEquipmentChildMode(body.childMode)
      ? { childMode: parseEquipmentChildMode(body.childMode)! }
      : {}),
    ...(typeof body.childCapacity === 'number' ? { childCapacity: body.childCapacity } : {}),
  });

  if (!result.ok) {
    const status =
      result.error === 'TEMPLATE_NOT_FOUND' || result.error === 'RACK_NOT_FOUND'
        ? 404
        : result.error === 'SERIAL_ALREADY_ASSIGNED'
          ? 409
          : result.error === 'INVALID_NAME'
            ? 400
            : 422;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.value, { status: 201 });
}
