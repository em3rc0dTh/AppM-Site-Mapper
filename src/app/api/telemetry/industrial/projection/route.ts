import { logicalRegistry } from '@/modules/telemetry/infrastructure/industrial/logical-points';
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
    const registry = await logicalRegistry();
    const points = (ids as string[]).map((id) => ({
      id,
      point: registry?.points.find((p) => p.publicationSignalId === id),
    }));
    const rows = await (
      await getObservationStore()
    ).byIds(points.map((p) => p.point?.activeSignalId ?? p.id));
    const signals = points.flatMap<Record<string, unknown>>(({ id, point }) => {
      const row = rows.find((s) => s.id === (point?.activeSignalId ?? id));
      const retired = registry?.retiredAlarms?.[id];
      const retainedAlarm =
        retired &&
        (!row ||
          row.kind === 'unknown' ||
          (row.kind === 'alarm' && !['ACTIVE', 'RESOLVED'].includes(row.alarmState ?? '')))
          ? {
              kind: 'alarm',
              alarmState: retired.alarmState,
              alarmObservedAt: retired.observedAt,
              alarmEvidence: retired,
            }
          : {};
      return row
        ? [
            {
              ...row,
              id,
              transportSignalId: row.id,
              ...retainedAlarm,
              ...(point
                ? {
                    logicalPointId: point.logicalPointId,
                    authorityRegistryVersion: registry!.version,
                  }
                : {}),
            },
          ]
        : point
          ? [
              {
                id,
                logicalPointId: point.logicalPointId,
                authorityRegistryVersion: registry!.version,
                quality: 'UNOBSERVED',
                kind: 'unknown',
                value: null,
                unit: point.unit,
                alarmState: null,
                observedAt: '1970-01-01T00:00:00.000Z',
                receivedAt: '1970-01-01T00:00:00.000Z',
                staleMs: 1000,
                ...retainedAlarm,
              },
            ]
          : [];
    });
    return Response.json({ signals }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'PROJECTION_UNAVAILABLE' }, { status: 503 });
  }
}
