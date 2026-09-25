import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import type { PointMm } from '@/modules/spatial/domain/geometry';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function parsePolygon(value: unknown): readonly PointMm[] | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }

  const points: PointMm[] = [];

  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('x' in item) ||
      !('y' in item) ||
      typeof item.x !== 'number' ||
      typeof item.y !== 'number' ||
      !Number.isFinite(item.x) ||
      !Number.isFinite(item.y)
    ) {
      return null;
    }

    points.push({ x: item.x, y: item.y });
  }

  return points;
}

export async function GET(_request: Request, context: Context) {
  const auth = await requirePermission('topology:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await new SpatialService(await createTopologyRepository()).getRoomLayout(id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ layout: result.value });
}

export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const polygon =
    body && typeof body === 'object' && 'polygon' in body ? parsePolygon(body.polygon) : null;

  if (!polygon) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new SpatialService(await createTopologyRepository()).updateRoomPolygon(
    id,
    polygon,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === 'CONCURRENCY_CONFLICT' ? 409 : 422 },
    );
  }

  return NextResponse.json({ room: result.value });
}
