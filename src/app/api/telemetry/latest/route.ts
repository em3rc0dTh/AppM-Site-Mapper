import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const entityId = new URL(request.url).searchParams.get('entityId')?.trim();
  const telemetry = await getTelemetryRuntime();

  if (entityId) {
    const sample = telemetry.service.latest(entityId);
    return sample
      ? NextResponse.json({ sample })
      : NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({ samples: telemetry.service.snapshot() });
}
