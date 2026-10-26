import { readBoundedJson as readHardenedJson, jsonBodyErrorStatus as hardenedJsonStatus, isSafeMutationRequest as hardenedSafeMutation } from '@/shared/http/request-security';
import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  if (process.env.APP_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_AVAILABLE' }, { status: 404 });
  }

  const auth = await requirePermission('settings:write');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  if (!hardenedSafeMutation(request)) return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsedBody = await readHardenedJson(request, { maxBytes: 300_000, maxDepth: 20, maxNodes: 20_000 });
  if (!parsedBody.ok) return Response.json({ error: parsedBody.error }, { status: hardenedJsonStatus(parsedBody.error) });
  const body: unknown = parsedBody.value;

  if (!isRecord(body) || typeof body.topic !== 'string' || !isRecord(body.payload)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const telemetry = await getTelemetryRuntime();
  const result = await telemetry.service.ingest(
    body.topic,
    new TextEncoder().encode(JSON.stringify(body.payload)),
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ sample: result.value }, { status: 202 });
}
