import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { EquipmentChildMode, EquipmentType } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

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

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await context.params;
  const service = new TopologyService(await createTopologyRepository());
  const node = await service.getById(id);

  if (!node) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({
    node,
    children: await service.listChildren(id),
    deepLink: await service.buildDeepLink(id),
  });
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const service = new TopologyService(await createTopologyRepository());
  let result;

  if (body.action === 'archive') {
    result = await service.archive(id);
  } else if (body.action === 'restore') {
    result = await service.restore(id);
  } else if (body.action === 'move' && 'parentId' in body && typeof body.parentId === 'string') {
    result = await service.move(
      id,
      body.parentId,
      'slotIndex' in body && typeof body.slotIndex === 'number' ? body.slotIndex : undefined,
    );
  } else if (body.action === 'configure-equipment') {
    result = await service.configureEquipment(id, {
      ...('equipmentType' in body && equipmentType(body.equipmentType)
        ? { equipmentType: equipmentType(body.equipmentType)! }
        : {}),
      ...('childMode' in body && childMode(body.childMode)
        ? { childMode: childMode(body.childMode)! }
        : {}),
      ...('childCapacity' in body && typeof body.childCapacity === 'number'
        ? { childCapacity: body.childCapacity }
        : {}),
    });
  } else {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ node: result.value });
}
