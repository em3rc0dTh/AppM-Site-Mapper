import { NextResponse } from 'next/server';

import { getAuditRuntime } from '@/modules/audit/infrastructure/audit-runtime';
import { requirePermission } from '@/modules/identity/application/current-session';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseLimit(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get('limit');
  if (raw === null) return 50;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null;
}

export async function GET(request: Request) {
  const auth = await requirePermission('settings:read');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const limit = parseLimit(request);
  if (limit === null) {
    return NextResponse.json({ error: 'INVALID_LIMIT' }, { status: 400 });
  }

  const telemetry = await getTelemetryRuntime();
  return NextResponse.json({ events: await telemetry.service.deadLetters(limit) });
}

export async function POST(request: Request) {
  const auth = await requirePermission('system:danger');

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { eventId?: unknown } | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';

  if (!eventId || eventId.length > 128) {
    return NextResponse.json({ error: 'INVALID_EVENT_ID' }, { status: 400 });
  }

  const telemetry = await getTelemetryRuntime();
  const replay = await telemetry.service.requeueDeadLetter(eventId);

  if (!replay) {
    return NextResponse.json({ error: 'DEAD_LETTER_NOT_FOUND' }, { status: 404 });
  }

  const audit = await getAuditRuntime();
  await audit.service.record({
    actor: { type: 'USER', userId: auth.value.id },
    action: 'TELEMETRY.HISTORY_REQUEUED',
    target: { kind: 'TELEMETRY_EVENT', id: replay.summary.eventId },
    metadata: {
      sourceId: replay.summary.sourceId,
      entityId: replay.summary.entityId,
      historyAttempts: replay.summary.historyAttempts,
      previousErrorCode: replay.previousErrorCode ?? null,
      previousDeadLetteredAt: replay.previousDeadLetteredAt ?? null,
    },
  });

  return NextResponse.json({
    event: replay.summary,
    status: 'REQUEUED',
  });
}
