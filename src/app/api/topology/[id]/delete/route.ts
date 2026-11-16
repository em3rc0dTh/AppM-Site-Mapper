import { NextResponse } from 'next/server';
import { requirePermission } from '@/modules/identity/application/current-session';
import {
  createTopologyRepository,
  getPersistenceMode,
} from '@/modules/topology/infrastructure/topology-repository-factory';
import { createPowerRepository } from '@/modules/power/infrastructure/power-repository-factory';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import {
  TopologyDeletionService,
  type DeletionMode,
} from '@/modules/topology/application/topology-deletion-service';
import {
  isSafeMutationRequest,
  hasOnlyKeys,
  readBoundedJson,
  jsonBodyErrorStatus,
} from '@/shared/http/request-security';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
import { IntegrityConflict } from '@/shared/infrastructure/mongodb/integrity-transaction';

type Context = Readonly<{ params: Promise<{ id: string }> }>;

function validMode(value: unknown): value is DeletionMode {
  return value === 'SINGLE' || value === 'TREE';
}

async function service() {
  return new TopologyDeletionService(
    await createTopologyRepository(),
    await createPowerRepository(),
    await createTelemetryBindingRepository(),
  );
}

export async function GET(request: Request, context: Context) {
  const auth = await requirePermission('system:danger');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (getPersistenceMode() !== 'mongodb')
    return NextResponse.json({ error: 'ATOMIC_DELETION_REQUIRED' }, { status: 503 });
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  if (!validMode(mode)) return NextResponse.json({ error: 'INVALID_MODE' }, { status: 400 });
  try {
    const { id } = await context.params;
    return NextResponse.json({ preview: await (await service()).preview(id, mode) });
  } catch (error) {
    if (error instanceof IntegrityConflict) return integrityErrorResponse(error);
    throw error;
  }
}

export async function POST(request: Request, context: Context) {
  const auth = await requirePermission('system:danger');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return NextResponse.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  if (getPersistenceMode() !== 'mongodb')
    return NextResponse.json({ error: 'ATOMIC_DELETION_REQUIRED' }, { status: 503 });
  const parsed = await readBoundedJson(request, { maxBytes: 4096, maxDepth: 3, maxNodes: 24 });
  if (!parsed.ok)
    return NextResponse.json(
      { error: parsed.error },
      { status: jsonBodyErrorStatus(parsed.error) },
    );
  const body = parsed.value;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !hasOnlyKeys(body as Record<string, unknown>, ['mode', 'name', 'token']) ||
    !('mode' in body) ||
    !validMode(body.mode) ||
    !('name' in body) ||
    typeof body.name !== 'string' ||
    body.name.length > 120 ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    !/^[0-9a-f]{64}$/.test(body.token)
  ) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    const result = await (
      await service()
    ).delete(
      id,
      {
        mode: body.mode,
        name: body.name,
        token: body.token,
      },
      auth.value.id,
    );
    return NextResponse.json({
      deleted: true,
      operationId: result.operationId,
      preview: result.preview,
    });
  } catch (error) {
    if (error instanceof IntegrityConflict) return integrityErrorResponse(error);
    throw error;
  }
}
