import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function PATCH(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (!isRecord(body) || typeof body.pinned !== 'boolean') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new InventoryService(await createTopologyRepository()).setPinned(
    id,
    body.pinned,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ item: result.value });
}
