import { requirePermission } from '@/modules/identity/application/current-session';
import { projectCompositionHistory } from '@/modules/telemetry/application/composition-history';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET_MS: Record<TelemetryHistoryWindow, number> = {
  '24h': 5 * 60_000,
  '7d': 60 * 60_000,
  '15d': 3 * 60 * 60_000,
  '1M': 6 * 60 * 60_000,
};

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const query = new URL(request.url).searchParams;
  const equipmentId = query.get('equipmentId');
  const window = query.get('window');
  if (
    !equipmentId ||
    equipmentId.length > 128 ||
    !window ||
    !TELEMETRY_HISTORY_WINDOWS.includes(window as TelemetryHistoryWindow)
  ) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  if (process.env.TELEMETRY_HISTORY_ENABLED !== 'true') {
    return Response.json({ error: 'HISTORY_STORE_DISABLED' }, { status: 503 });
  }

  const repository = await createTopologyRepository();
  const root = await repository.getById(equipmentId);
  if (!root || root.kind !== 'EQUIPMENT' || root.lifecycle !== 'ACTIVE') {
    return Response.json({ error: 'EQUIPMENT_NOT_FOUND' }, { status: 404 });
  }
  const deviceId = root.deviceId;
  const family = (await repository.listEquipmentForDevice(deviceId)).filter(
    (node) => node.lifecycle === 'ACTIVE',
  );
  const byId = new Map(family.map((item) => [item.id, item]));
  byId.set(root.id, root);
  const seen = new Set<string>();
  const breakers: EquipmentNode[] = [];
  function visit(node: EquipmentNode) {
    if (seen.has(node.id) || node.lifecycle !== 'ACTIVE') return;
    seen.add(node.id);
    if (node.equipmentType === 'CIRCUIT_BREAKER') {
      breakers.push(node);
      return;
    }
    for (const childId of node.children) {
      const child = childId ? byId.get(childId) : undefined;
      if (child && child.deviceId === deviceId) visit(child);
    }
  }
  visit(root);
  if (breakers.length > 128) {
    return Response.json(
      { error: 'HISTORY_SCOPE_TOO_LARGE', breakerCount: breakers.length },
      { status: 413 },
    );
  }
  const ids = breakers.map((item) => item.id);
  if (!ids.length) {
    return Response.json(
      {
        equipmentId,
        window,
        breakerCount: 0,
        boundBreakerCount: 0,
        points: [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const active = (
    await (await createTelemetryBindingRepository()).listForTargets('EQUIPMENT', ids)
  ).filter((b) => b.lifecycle === 'ACTIVE' && b.protocol === 'MQTT');
  const bindings = active.map((b) => ({
    id: b.id,
    targetId: b.targetId,
    sourceIdentity: b.sourceIdentity,
    ...(b.sourcePointId ? { sourcePointId: b.sourcePointId } : {}),
    metric: b.metric,
  }));
  const boundIds = [...new Set(active.map((b) => b.targetId))];
  const store = createTelemetryStoreClient();
  const groups = new Map<string, Awaited<ReturnType<typeof store.queryEntity>>>();
  try {
    // Bounded concurrency against the same protected TimescaleDB history adapter.
    for (let index = 0; index < boundIds.length; index += 8) {
      const batch = boundIds.slice(index, index + 8);
      const results = await Promise.all(
        batch.map((id) => store.queryEntity(id, 'EQUIPMENT', window as TelemetryHistoryWindow)),
      );
      batch.forEach((id, offset) => groups.set(id, results[offset]!));
    }
  } catch {
    // Never portray a partial set of children as a completed hierarchy.
    return Response.json({ error: 'HISTORY_STORE_UNAVAILABLE' }, { status: 503 });
  }

  const points = projectCompositionHistory(
    root,
    byId,
    groups,
    bindings,
    BUCKET_MS[window as TelemetryHistoryWindow],
  );
  return Response.json(
    {
      equipmentId,
      window,
      breakerCount: breakers.length,
      boundBreakerCount: boundIds.length,
      points,
      aggregation: 'MEAN_OF_REPORTING_IMMEDIATE_CHILD_MEANS',
      source: 'EXPLICIT_MQTT_EQUIPMENT_BINDINGS',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
