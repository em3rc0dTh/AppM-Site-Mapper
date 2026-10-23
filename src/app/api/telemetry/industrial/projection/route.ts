import { collectorTokenEquals } from '@/modules/telemetry/application/snmp-ingest-credentials';
import { getObservationStore } from '@/modules/telemetry/infrastructure/industrial/runtime';
import { readBoundedJson } from '@/shared/http/request-security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (
    !collectorTokenEquals(
      request.headers.get('authorization'),
      process.env.INDUSTRIAL_PROJECTION_TOKEN ?? '',
    )
  )
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const body = await readBoundedJson(request, { maxBytes: 750000, maxNodes: 10010 });
  const ids =
    body.ok && body.value && typeof body.value === 'object' && 'signalIds' in body.value
      ? body.value.signalIds
      : null;
  if (
    !Array.isArray(ids) ||
    ids.length > 10000 ||
    ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))
  )
    return Response.json({ error: 'INVALID_POINTS' }, { status: 400 });
  try {
    const signals = await (await getObservationStore()).byIds(ids as string[]);
    return Response.json({ signals }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'PROJECTION_UNAVAILABLE' }, { status: 503 });
  }
}
