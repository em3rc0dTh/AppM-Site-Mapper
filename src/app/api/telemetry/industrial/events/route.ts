import { requirePermission } from '@/modules/identity/application/current-session';
import { getObservationStore } from '@/modules/telemetry/infrastructure/industrial/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[a-f0-9-]{36,64}$/.test(id))
    return Response.json({ error: 'INVALID_ID' }, { status: 400 });
  try {
    const envelope = await (await getObservationStore()).event(id);
    return Response.json(
      { envelope },
      { status: envelope ? 200 : 404, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'CAPTURE_UNAVAILABLE' }, { status: 503 });
  }
}
