import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { updateStructureBoundary } from '@/modules/spatial/application/structure-boundary-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const text = await request.text();
  if (text.length > 32_000)
    return NextResponse.json({ error: 'BOUNDARY_TOO_LARGE' }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await updateStructureBoundary(await createTopologyRepository(), id, body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status:
          result.error === 'BOUNDARY_CONFLICT'
            ? 409
            : result.error === 'STRUCTURE_NOT_FOUND'
              ? 404
              : 422,
      },
    );
  }

  return NextResponse.json({ node: result.value });
}
