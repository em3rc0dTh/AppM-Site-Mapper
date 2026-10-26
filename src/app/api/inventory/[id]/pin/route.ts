import { readBoundedJson as readHardenedJson, jsonBodyErrorStatus as hardenedJsonStatus, isSafeMutationRequest as hardenedSafeMutation } from '@/shared/http/request-security';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function handlePATCH(request: Request, context: Context) {
  const auth = await requirePermission('topology:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (!hardenedSafeMutation(request)) return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsedBody = await readHardenedJson(request);
  if (!parsedBody.ok) return Response.json({ error: parsedBody.error }, { status: hardenedJsonStatus(parsedBody.error) });
  const body: unknown = parsedBody.value;

  if (!isRecord(body) || typeof body.pinned !== 'boolean') {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await new InventoryService(await createTopologyRepository()).setPinned(
    id,
    body.pinned,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'LAYOUT_CONFLICT' ? 409 : 404 });
  }

  return NextResponse.json({ item: result.value });
}

export async function PATCH(request: Request, context: Context) {
  try { return await handlePATCH(request, context); } catch (error) { return integrityErrorResponse(error); }
}
