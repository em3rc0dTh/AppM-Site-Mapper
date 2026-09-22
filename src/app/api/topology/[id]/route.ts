import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

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
    result = await service.move(id, body.parentId);
  } else {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ node: result.value });
}
