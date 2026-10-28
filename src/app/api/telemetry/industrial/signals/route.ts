import {
  associateLogicalSignals,
  logicalRegistry,
} from '@/modules/telemetry/infrastructure/industrial/logical-points';
import { captureDiagnostics } from '@/modules/telemetry/infrastructure/industrial/diagnostics';
import {
  publicationManifest,
  publicationStatus,
} from '@/modules/telemetry/infrastructure/industrial/publication';
import { correlateObservations } from '@/modules/telemetry/domain/industrial/correlation';
import { requirePermission } from '@/modules/identity/application/current-session';
import { getObservationStore } from '@/modules/telemetry/infrastructure/industrial/runtime';
import {
  signalQuality,
  communicationQuality,
} from '@/modules/telemetry/domain/industrial/observations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const source = params.get('source') ?? undefined;
  const target = params.get('target');
  const paginated = params.has('limit') || params.has('cursor');
  const pageSize = paginated ? Number(params.get('limit') ?? 200) : 1000;
  const cursor = params.get('cursor') ?? undefined;
  if (
    (source?.length ?? 0) > 120 ||
    (target?.length ?? 0) > 128 ||
    (paginated && (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500)) ||
    (cursor !== undefined && !/^[a-f0-9]{64}$/.test(cursor))
  )
    return Response.json({ error: 'INVALID_FILTER' }, { status: 400 });
  try {
    let manifest;
    let publicationUnavailable = false;
    try {
      manifest = await publicationManifest();
    } catch {
      manifest = null;
      publicationUnavailable = true;
    }
    const all = await (
      await getObservationStore()
    ).list(source, paginated ? pageSize + 1 : 1000, target ?? undefined, cursor);
    const hasNext = paginated && all.length > pageSize;
    const page = hasNext ? all.slice(0, pageSize) : all;
    const registry = await logicalRegistry();
    const associated = associateLogicalSignals(page, registry);
    const signals = associated
      .filter((s) => !target || s.targetId === target)
      .map((s) => {
        const current = { ...s, quality: signalQuality(s) };
        return {
          ...current,
          communicationQuality: communicationQuality(s),
          publication: publicationStatus(current, manifest),
        };
      });
    const unobservedPublishedPoints = [];
    if (manifest && !source && !target && !paginated) {
      const observed = new Set(
        (
          await (
            await getObservationStore()
          ).byIds(
            manifest.points.map(
              (p) =>
                registry?.points.find((r) => r.publicationSignalId === p.signalId)
                  ?.activeSignalId ?? p.signalId,
            ),
          )
        ).map(
          (s) =>
            registry?.points.find((r) => r.activeSignalId === s.id)?.publicationSignalId ?? s.id,
        ),
      );
      for (const point of manifest.points)
        if (!observed.has(point.signalId))
          unobservedPublishedPoints.push({
            ...point,
            qualityAddress: point.address + 2,
            registryVersion: manifest.version,
            quality: 'UNOBSERVED',
            qualityCode: 0,
            valueAvailableByPolicy: false,
          });
    }
    const operational = await captureDiagnostics();
    if (publicationUnavailable) {
      operational.status = 'DEGRADED';
      operational.alerts.push('MODBUS_MANIFEST_UNAVAILABLE');
    }
    return Response.json(
      {
        signals,
        unobservedPublishedPoints,
        operational,
        publicationConfiguration: publicationUnavailable
          ? 'UNAVAILABLE'
          : manifest
            ? 'CONFIGURED'
            : 'NOT_CONFIGURED',
        correlations: correlateObservations(signals),
        limit: pageSize,
        truncated: hasNext || (!paginated && all.length === 1000),
        nextCursor: hasNext ? page.at(-1)!.id : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'CATALOG_UNAVAILABLE' }, { status: 503 });
  }
}
