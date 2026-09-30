import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { createWarehouseRepository } from '@/modules/warehouse/infrastructure/warehouse-repository-factory';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = object(await request.json().catch(() => null));
  if (
    !body ||
    typeof body.templateId !== 'string' ||
    typeof body.rackId !== 'string' ||
    typeof body.name !== 'string'
  )
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const result = await new WarehouseInstantiationService(
    await createWarehouseRepository(),
    await createTopologyRepository(),
  ).instantiate({
    templateId: body.templateId,
    rackId: body.rackId,
    name: body.name,
    ...(typeof body.serialNumber === 'string' ? { serialNumber: body.serialNumber } : {}),
    ...(typeof body.category === 'string' ? { category: body.category } : {}),
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
