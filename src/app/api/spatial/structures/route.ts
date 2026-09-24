import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { StructureAuthoringService } from '@/modules/spatial/application/structure-authoring-service';
import type { PointMm } from '@/modules/spatial/domain/geometry';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parsePolygon(value: unknown): readonly PointMm[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 256) {
    return null;
  }

  const points: PointMm[] = [];

  for (const item of value) {
    const point = asObject(item);

    if (
      !point ||
      typeof point.x !== 'number' ||
      typeof point.y !== 'number' ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      return null;
    }

    points.push({ x: point.x, y: point.y });
  }

  return points;
}

export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body = asObject(await request.json().catch(() => null));

  if (!body || typeof body.parentId !== 'string' || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const polygon =
    body.polygon === undefined ? undefined : parsePolygon(body.polygon);

  if (body.polygon !== undefined && !polygon) {
    return NextResponse.json({ error: 'INVALID_POLYGON' }, { status: 400 });
  }

  const repository = await createTopologyRepository();
  const result = await new StructureAuthoringService(repository).create({
    parentId: body.parentId,
    name: body.name,
    ...(polygon ? { polygon } : {}),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const href = await new TopologyService(repository).buildDeepLink(result.value.id);

  return NextResponse.json({ node: result.value, href }, { status: 201 });
}
