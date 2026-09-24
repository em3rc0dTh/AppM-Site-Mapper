import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { ClusterRunAuthoringService } from '@/modules/spatial/application/cluster-run-authoring-service';
import type { GridCoordinate } from '@/modules/topology/domain/entities';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function parseCoordinate(value: unknown): GridCoordinate | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('row' in value) ||
    !('column' in value) ||
    typeof value.row !== 'string' ||
    typeof value.column !== 'number' ||
    !Number.isInteger(value.column) ||
    value.column < 1 ||
    !value.row.trim()
  ) {
    return null;
  }

  return {
    row: value.row.trim().toUpperCase(),
    column: value.column,
  };
}

export async function PUT(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== 'object' || !('start' in body) || !('end' in body)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const start = parseCoordinate(body.start);
  const end = parseCoordinate(body.end);

  if (!start || !end) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new ClusterRunAuthoringService(
    await createTopologyRepository(),
  ).configure(id, { start, end });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    cluster: result.value.cluster,
    positions: result.value.positions,
  });
}
