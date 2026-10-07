import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import type {
  EquipmentChildMode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
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

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = object(await request.json().catch(() => null));
  if (
    !body ||
    typeof body.templateId !== 'string' ||
    typeof body.parentEquipmentId !== 'string'
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
    ...(equipmentType(body.equipmentType)
      ? { equipmentType: equipmentType(body.equipmentType)! }
      : {}),
    ...(childMode(body.childMode) ? { childMode: childMode(body.childMode)! } : {}),
    ...(typeof body.childCapacity === 'number'
      ? { childCapacity: body.childCapacity }
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
