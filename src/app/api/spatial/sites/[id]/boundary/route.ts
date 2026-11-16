import {
  readBoundedJson,
  jsonBodyErrorStatus,
  isSafeMutationRequest,
} from '@/shared/http/request-security';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/modules/identity/application/current-session';
import { updateSiteBoundary } from '@/modules/spatial/application/site-boundary-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

async function handlePUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 32_000 });
  if (!parsed.ok)
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  const body = parsed.value;
  const { id } = await context.params;
  const result = await updateSiteBoundary(await createTopologyRepository(), id, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      {
        status:
          result.error === 'BOUNDARY_CONFLICT'
            ? 409
            : result.error === 'SITE_NOT_FOUND'
              ? 404
              : 422,
      },
    );
  return NextResponse.json({ node: result.value });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await handlePUT(request, context);
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
