import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import type { BdfbStructure } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isBdfbStructure(value: unknown): value is BdfbStructure {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'shelves' in value &&
      Array.isArray((value as { shelves?: unknown }).shelves),
  );
}

export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('power:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (!isBdfbStructure(body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new BdfbService(await createTopologyRepository()).configure(id, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ device: result.value });
}
