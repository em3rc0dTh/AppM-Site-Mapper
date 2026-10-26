import { requirePermission } from '@/modules/identity/application/current-session';
import { getObservationStore } from '@/modules/telemetry/infrastructure/industrial/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const signalId = params.get('signalId') ?? '';
  let before = params.get('before') ?? new Date().toISOString();
  let beforeEventId: string | undefined;
  if (params.has('cursor')) {
    try {
      const cursor: unknown = JSON.parse(
        Buffer.from(params.get('cursor')!, 'base64url').toString(),
      );
      if (
        !Array.isArray(cursor) ||
        cursor.length !== 2 ||
        typeof cursor[0] !== 'string' ||
        typeof cursor[1] !== 'string' ||
        !/^[a-f0-9-]{36,64}$/.test(cursor[1])
      )
        throw new Error('Invalid cursor');
      before = cursor[0];
      beforeEventId = cursor[1];
    } catch {
      return Response.json({ error: 'INVALID_CURSOR' }, { status: 400 });
    }
  }
  if (!/^[a-f0-9]{64}$/.test(signalId) || !Number.isFinite(Date.parse(before)))
    return Response.json({ error: 'INVALID_QUERY' }, { status: 400 });
  try {
    const observations = await (
      await getObservationStore()
    ).history(signalId, new Date(before).toISOString(), 100, beforeEventId);
    return Response.json(
      {
        observations,
        limit: 100,
        nextCursor:
          observations.length === 100
            ? Buffer.from(
                JSON.stringify([observations.at(-1)!.receivedAt, observations.at(-1)!.eventId]),
              ).toString('base64url')
            : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'HISTORY_UNAVAILABLE' }, { status: 503 });
  }
}
