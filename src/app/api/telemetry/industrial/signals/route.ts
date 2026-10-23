import { correlateObservations } from '@/modules/telemetry/domain/industrial/correlation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { getObservationStore } from '@/modules/telemetry/infrastructure/industrial/runtime';
import { signalQuality } from '@/modules/telemetry/domain/industrial/observations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const source = params.get('source') ?? undefined;
  const target = params.get('target');
  if ((source?.length ?? 0) > 120 || (target?.length ?? 0) > 128)
    return Response.json({ error: 'INVALID_FILTER' }, { status: 400 });
  try {
    const all = await (await getObservationStore()).list(source, 1000, target ?? undefined);
    const signals = all
      .filter((s) => !target || s.targetId === target)
      .map((s) => ({ ...s, quality: signalQuality(s) }));
    return Response.json(
      {
        signals,
        correlations: correlateObservations(signals),
        limit: 1000,
        truncated: all.length === 1000,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'CATALOG_UNAVAILABLE' }, { status: 503 });
  }
}
