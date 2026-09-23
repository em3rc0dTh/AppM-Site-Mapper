import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { CasService } from '@/modules/rack/application/cas-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function POST(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || !('action' in body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const service = new CasService(await createTopologyRepository());
  let result;

  if (
    body.action === 'reserve' &&
    'mountStartU' in body &&
    'physicalSizeU' in body &&
    typeof body.mountStartU === 'number' &&
    typeof body.physicalSizeU === 'number'
  ) {
    result = await service.reserve(id, {
      mountStartU: body.mountStartU,
      physicalSizeU: body.physicalSizeU,
      ...('clearanceTopU' in body && typeof body.clearanceTopU === 'number'
        ? { clearanceTopU: body.clearanceTopU }
        : {}),
      ...('clearanceBottomU' in body && typeof body.clearanceBottomU === 'number'
        ? { clearanceBottomU: body.clearanceBottomU }
        : {}),
    });
  } else if (
    body.action === 'equip' &&
    'allocationId' in body &&
    'occupantId' in body &&
    typeof body.allocationId === 'string' &&
    typeof body.occupantId === 'string'
  ) {
    result = await service.equip(id, body.allocationId, body.occupantId);
  } else if (
    body.action === 'free' &&
    'allocationId' in body &&
    typeof body.allocationId === 'string'
  ) {
    result = await service.free(id, body.allocationId);
  } else {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ rack: result.value });
}
