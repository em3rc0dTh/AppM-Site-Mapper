import { requirePermission } from '@/modules/identity/application/current-session';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { compositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function peakMagnitude(values: readonly number[]): number | null {
  return values.length ? Math.max(...values.map((value) => Math.abs(value))) : null;
}

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const deviceId = params.get('deviceId')?.trim();
  const window = params.get('window');
  if (
    !deviceId ||
    deviceId.length > 128 ||
    !window ||
    !TELEMETRY_HISTORY_WINDOWS.includes(window as TelemetryHistoryWindow)
  ) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  if (process.env.TELEMETRY_HISTORY_ENABLED !== 'true') {
    return Response.json({ error: 'HISTORY_STORE_DISABLED' }, { status: 503 });
  }

  const repository = await createTopologyRepository();
  const device = await repository.getById(deviceId);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE') {
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  }
  const presentation = await new BdfbProjectionService(repository).get(deviceId);
  if (!presentation) return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });

  const breakers = presentation.shelves.flatMap((shelf) =>
    shelf.frames.flatMap((frame) =>
      frame.panels.flatMap((panel) =>
        panel.positions.flatMap((breaker, index) =>
          breaker
            ? [
                {
                  id: breaker.id,
                  label: breaker.label,
                  panelId: panel.id,
                  panelLabel: panel.label,
                  position: index + 1,
                },
              ]
            : [],
        ),
      ),
    ),
  );
  if (breakers.length > 128) {
    return Response.json({ error: 'HISTORY_SCOPE_TOO_LARGE' }, { status: 413 });
  }

  const ids = breakers.map((breaker) => breaker.id);
  const activeBindings = ids.length
    ? (await (await createTelemetryBindingRepository()).listForTargets('EQUIPMENT', ids)).filter(
        (binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'MQTT',
      )
    : [];
  const bindings = activeBindings.map((binding) => ({
    id: binding.id,
    targetId: binding.targetId,
    sourceIdentity: binding.sourceIdentity,
    ...(binding.sourcePointId ? { sourcePointId: binding.sourcePointId } : {}),
    metric: binding.metric,
  }));
  const boundIds = new Set(activeBindings.map((binding) => binding.targetId));
  const store = createTelemetryStoreClient();
  const sampleGroups = new Map<string, Awaited<ReturnType<typeof store.queryEntity>>>();

  try {
    const queryIds = breakers
      .filter((breaker) => boundIds.has(breaker.id))
      .map((breaker) => breaker.id);
    for (let index = 0; index < queryIds.length; index += 8) {
      const batch = queryIds.slice(index, index + 8);
      const results = await Promise.all(
        batch.map((id) => store.queryEntity(id, 'EQUIPMENT', window as TelemetryHistoryWindow)),
      );
      batch.forEach((id, offset) => sampleGroups.set(id, results[offset]!));
    }
  } catch {
    return Response.json({ error: 'HISTORY_STORE_UNAVAILABLE' }, { status: 503 });
  }

  const rows = breakers.map((breaker) => {
    const samples = sampleGroups.get(breaker.id) ?? [];
    const readings = samples.flatMap((sample) => {
      const observedAt = sample.sourceObservedAt ?? sample.receivedAt;
      const now = Date.parse(observedAt);
      if (!Number.isFinite(now)) return [];
      const reading = compositionBreakerTelemetry(breaker.id, deviceId, [sample], bindings, now);
      return reading.status === 'LIVE' ? [{ ...reading, observedAt }] : [];
    });
    const voltage = readings.flatMap((reading) =>
      typeof reading.voltageV === 'number' && Number.isFinite(reading.voltageV)
        ? [reading.voltageV]
        : [],
    );
    const current = readings.flatMap((reading) =>
      typeof reading.currentA === 'number' && Number.isFinite(reading.currentA)
        ? [reading.currentA]
        : [],
    );
    const powerKw = readings.flatMap((reading) =>
      typeof reading.powerW === 'number' && Number.isFinite(reading.powerW)
        ? [reading.powerW / 1000]
        : [],
    );
    const energy = readings.flatMap((reading) =>
      typeof reading.energyKwh === 'number' && Number.isFinite(reading.energyKwh)
        ? [{ value: reading.energyKwh, at: reading.observedAt }]
        : [],
    );
    const observed = readings
      .map((reading) => Date.parse(reading.observedAt))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return {
      ...breaker,
      bound: boundIds.has(breaker.id),
      sampleCount: readings.length,
      averageVoltageV: average(voltage),
      averageCurrentA: average(current),
      peakAbsCurrentA: peakMagnitude(current),
      averagePowerKw: average(powerKw),
      peakAbsPowerKw: peakMagnitude(powerKw),
      latestEnergyCounterKwh: energy.length
        ? energy.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)!.value
        : null,
      firstObservedAt: observed.length ? new Date(observed[0]!).toISOString() : null,
      lastObservedAt: observed.length ? new Date(observed.at(-1)!).toISOString() : null,
    };
  });

  return Response.json(
    {
      deviceId,
      window,
      installedBreakerCount: breakers.length,
      boundBreakerCount: boundIds.size,
      reportingBreakerCount: rows.filter((row) => row.sampleCount > 0).length,
      rows,
      source: 'EXPLICIT_MQTT_EQUIPMENT_BINDINGS',
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
