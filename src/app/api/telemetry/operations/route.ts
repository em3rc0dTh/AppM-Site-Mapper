import { NextResponse } from 'next/server';

import { requirePermission } from '@/modules/identity/application/current-session';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requirePermission('settings:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const telemetry = await getTelemetryRuntime();
  return NextResponse.json({ history: await telemetry.service.historyStats() });
}
