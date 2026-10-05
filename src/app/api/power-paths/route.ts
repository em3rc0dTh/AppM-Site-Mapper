import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { PowerService } from '@/modules/power/application/power-service';
import type { PowerFeed } from '@/modules/power/domain/entities';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function GET() {
  const auth = await requirePermission('power:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const service = new PowerService(await createTopologyRepository(), await createPowerRepository());
  return NextResponse.json({ paths: await service.listActive() });
}

export async function POST(request: Request) {
  const auth = await requirePermission('power:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (
    !isRecord(body) ||
    typeof body.sourceAccessPortId !== 'string' ||
    typeof body.targetAccessPortId !== 'string'
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const feed = body.feed === 'A' || body.feed === 'B' ? (body.feed as PowerFeed) : undefined;

  if (body.feed !== undefined && !feed) {
    return NextResponse.json({ error: 'INVALID_FEED' }, { status: 400 });
  }

  const label = typeof body.label === 'string' ? body.label : undefined;
  const service = new PowerService(await createTopologyRepository(), await createPowerRepository());
  const result = await service.create({
    sourceAccessPortId: body.sourceAccessPortId,
    targetAccessPortId: body.targetAccessPortId,
    ...(feed ? { feed } : {}),
    ...(label ? { label } : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ path: result.value }, { status: 201 });
}
