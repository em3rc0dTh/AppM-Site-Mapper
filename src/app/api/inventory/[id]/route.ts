import { NextResponse } from 'next/server';

import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { requirePermission } from '@/modules/identity/application/current-session';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await context.params;
  const service = new InventoryService(await createTopologyRepository());
  const result = await service.get(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ inventory: result.value });
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const input = {
    ...(typeof record.name === 'string' ? { name: record.name } : {}),
    ...(record.serialNumber === null || typeof record.serialNumber === 'string'
      ? { serialNumber: record.serialNumber }
      : {}),
    ...(record.category === null || typeof record.category === 'string'
      ? { category: record.category }
      : {}),
    ...(record.type === null || typeof record.type === 'string' ? { type: record.type } : {}),
    ...(typeof record.pinned === 'boolean' ? { pinned: record.pinned } : {}),
  };

  const service = new InventoryService(await createTopologyRepository());
  const result = await service.update(id, input);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ inventory: result.value });
}
