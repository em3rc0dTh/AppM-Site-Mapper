import { logicalRegistry } from '@/modules/telemetry/infrastructure/industrial/logical-points';
import { requirePermission } from '@/modules/identity/application/current-session';
import { industrialStoreUrl } from '@/modules/telemetry/infrastructure/industrial/timescale-outbox';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if (params.toString().length > 4096)
    return Response.json({ error: 'INVALID_QUERY' }, { status: 400 });
  try {
    const url = industrialStoreUrl('/industrial-history');
    for (const key of ['signalId', 'logicalPointId', 'from', 'to', 'cursor']) {
      if (params.has(key)) url.searchParams.set(key, params.get(key)!);
    }
    if (params.has('logicalPointId')) {
      const point = (await logicalRegistry())?.points.find(
        (p) => p.logicalPointId === params.get('logicalPointId'),
      );
      for (const alias of point?.aliases ?? []) url.searchParams.append('aliasId', alias);
    }
    const result = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.TELEMETRY_STORE_TOKEN}` },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      redirect: 'error',
    });
    if (!result.ok)
      return Response.json(
        { error: 'INDUSTRIAL_SERIES_UNAVAILABLE' },
        { status: result.status === 400 ? 400 : 503 },
      );
    return Response.json(await result.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'INDUSTRIAL_SERIES_UNAVAILABLE' }, { status: 503 });
  }
}
