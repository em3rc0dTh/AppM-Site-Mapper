import {
  parseAlarmPublicationLogicalPoint,
  projectAlarmPublicationSignals,
} from '@/modules/alarm/application/alarm-modbus-projection';
import { createAlarmRepository } from '@/modules/alarm/infrastructure/alarm-repository-factory';
import {
  parseQdfTotalCurrentLogicalPoint,
  parseQdfTotalPowerLogicalPoint,
  projectQdfTotalCurrentSignals,
  projectQdfTotalPowerSignals,
} from '@/modules/telemetry/application/qdf-modbus-projection';
import { collectorTokenEquals } from '@/modules/telemetry/application/snmp-ingest-credentials';
import { logicalRegistry } from '@/modules/telemetry/infrastructure/industrial/logical-points';
import { publicationManifest } from '@/modules/telemetry/infrastructure/industrial/publication';
import { getObservationStore } from '@/modules/telemetry/infrastructure/industrial/runtime';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
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
    const signalIds = ids as string[];
    const [registry, manifest] = await Promise.all([logicalRegistry(), publicationManifest()]);

    const alarmRequests = signalIds.flatMap((id) => {
      const point = manifest?.points.find((item) => item.signalId === id);
      return point?.logicalPointId && parseAlarmPublicationLogicalPoint(point.logicalPointId)
        ? [{ signalId: id, logicalPointId: point.logicalPointId }]
        : [];
    });
    const topology = await createTopologyRepository();
    const alarmSignals = alarmRequests.length
      ? await projectAlarmPublicationSignals(alarmRequests, await createAlarmRepository(), topology)
      : [];
    const alarmById = new Map(alarmSignals.map((signal) => [signal.id, signal]));

    const qdfCurrentRequests = signalIds.flatMap((id) => {
      const point = manifest?.points.find((item) => item.signalId === id);
      return point?.logicalPointId && parseQdfTotalCurrentLogicalPoint(point.logicalPointId)
        ? [{ signalId: id, logicalPointId: point.logicalPointId }]
        : [];
    });
    const qdfPowerRequests = signalIds.flatMap((id) => {
      const point = manifest?.points.find((item) => item.signalId === id);
      return point?.logicalPointId && parseQdfTotalPowerLogicalPoint(point.logicalPointId)
        ? [{ signalId: id, logicalPointId: point.logicalPointId }]
        : [];
    });
    const qdfDependencies =
      qdfCurrentRequests.length || qdfPowerRequests.length
        ? {
            bindings: await createTelemetryBindingRepository(),
            history: createTelemetryStoreClient(),
          }
        : null;
    const [qdfCurrentSignals, qdfPowerSignals] = await Promise.all([
      qdfCurrentRequests.length && qdfDependencies
        ? projectQdfTotalCurrentSignals(
            qdfCurrentRequests,
            topology,
            qdfDependencies.bindings,
            qdfDependencies.history,
          )
        : [],
      qdfPowerRequests.length && qdfDependencies
        ? projectQdfTotalPowerSignals(
            qdfPowerRequests,
            topology,
            qdfDependencies.bindings,
            qdfDependencies.history,
          )
        : [],
    ]);
    const qdfById = new Map(
      [...qdfCurrentSignals, ...qdfPowerSignals].map((signal) => [signal.id, signal]),
    );

    const industrialPoints = signalIds
      .filter((id) => !alarmById.has(id) && !qdfById.has(id))
      .map((id) => ({
        id,
        point: registry?.points.find((point) => point.publicationSignalId === id),
      }));
    const rows = await (
      await getObservationStore()
    ).byIds(industrialPoints.map((item) => item.point?.activeSignalId ?? item.id));

    const industrialById = new Map<string, Record<string, unknown>>();
    for (const { id, point } of industrialPoints) {
      const row = rows.find((signal) => signal.id === (point?.activeSignalId ?? id));
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

      if (row) {
        industrialById.set(id, {
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
        });
      } else if (point) {
        industrialById.set(id, {
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
        });
      }
    }

    const signals = signalIds.flatMap<Record<string, unknown>>((id) => {
      const alarm = alarmById.get(id);
      if (alarm) return [{ ...alarm }];
      const qdf = qdfById.get(id);
      if (qdf) return [{ ...qdf }];
      const industrial = industrialById.get(id);
      return industrial ? [industrial] : [];
    });

    return Response.json({ signals }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'PROJECTION_UNAVAILABLE' }, { status: 503 });
  }
}
