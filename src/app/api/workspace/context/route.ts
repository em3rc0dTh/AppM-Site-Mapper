import { NextResponse } from 'next/server';
import { requirePermission } from '@/modules/identity/application/current-session';
import { isWorkspaceHref } from '@/modules/workspace/domain/context';
import { readContext, writeContext } from '@/modules/workspace/infrastructure/context-repository';
export async function GET() {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  return NextResponse.json(await readContext(auth.value.id), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function PUT(request: Request) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !isWorkspaceHref(body.href) ||
    typeof body.name !== 'string' ||
    body.name.length > 160
  )
    return NextResponse.json({ error: 'INVALID_CONTEXT' }, { status: 400 });
  const current = await readContext(auth.value.id);
  const context = {
    ...current,
    lastContext: body.href,
    recent: [
      { href: body.href, name: body.name, visitedAt: new Date().toISOString() },
      ...current.recent.filter((item) => item.href !== body.href),
    ].slice(0, 12),
  };
  await writeContext(auth.value.id, context);
  return NextResponse.json(context);
}

export async function PATCH(request: Request) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    entityId?: unknown;
    pinned?: unknown;
  } | null;
  if (!body || typeof body.entityId !== 'string' || typeof body.pinned !== 'boolean')
    return NextResponse.json({ error: 'INVALID_PIN' }, { status: 400 });
  const { createTopologyRepository } =
    await import('@/modules/topology/infrastructure/topology-repository-factory');
  const node = await (await createTopologyRepository()).getById(body.entityId);
  if (
    !node ||
    node.lifecycle !== 'ACTIVE' ||
    !['CONTAINER_RACK', 'DEVICE', 'EQUIPMENT'].includes(node.kind)
  )
    return NextResponse.json({ error: 'OBJECT_NOT_FOUND' }, { status: 404 });
  const current = await readContext(auth.value.id);
  const pins = current.pinned.filter((id) => id !== node.id);
  if (body.pinned) pins.push(node.id);
  if (pins.length > 100) return NextResponse.json({ error: 'PIN_LIMIT' }, { status: 422 });
  const result = { ...current, pinned: pins };
  await writeContext(auth.value.id, result);
  return NextResponse.json(result);
}
