import { requirePermission } from '@/modules/identity/application/current-session';
import { TelemetryIdentityResolver } from '@/modules/telemetry/application/telemetry-identity-resolver';
import { entityTelemetryStatus } from '@/modules/telemetry/domain/entity-status';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const targetId = query.get('targetId');
  const window = query.get('window') ?? 'LIVE';
  if (
    !targetId ||
    (window !== 'LIVE' && !TELEMETRY_HISTORY_WINDOWS.includes(window as TelemetryHistoryWindow))
  )
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const repo = await createTopologyRepository();
  const node = await repo.getById(targetId);
  if (
    !node ||
    (node.kind !== 'DEVICE' && node.kind !== 'EQUIPMENT') ||
    !(await new TelemetryIdentityResolver(repo).valid(node))
  )
    return Response.json({ error: 'TARGET_NOT_FOUND' }, { status: 404 });
  const telemetry = await getTelemetryRuntime();
  const bindings = (
    await (await createTelemetryBindingRepository()).listForTarget(node.kind, node.id)
  ).filter((b) => b.lifecycle === 'ACTIVE');
  for (const binding of bindings) {
    if (binding.attributes?.discovery !== 'UNIQUE_INVENTORY_SN') continue;
    const matches = await repo.findActiveBySerialNumber(binding.sourceIdentity);
    if (matches.length !== 1 || matches[0]?.id !== node.id)
      return Response.json({ error: 'IDENTITY_CONFLICT' }, { status: 409 });
  }
  const latest = telemetry.service.latest(node.id);
  const sample =
    latest &&
    bindings.some((b) => b.id === latest.bindingId && b.sourceIdentity === latest.sourceIdentity) &&
    (latest.metricBindingIds ?? []).every((id) =>
      bindings.some(
        (b) =>
          b.id === id &&
          b.sourceIdentity === latest.sourceIdentity &&
          b.sourcePointId === latest.sourcePointId,
      ),
    )
      ? latest
      : null;
  let history = null;
  if (window !== 'LIVE') {
    if (process.env.TELEMETRY_HISTORY_ENABLED !== 'true')
      return Response.json({ error: 'HISTORY_STORE_DISABLED' }, { status: 503 });
    try {
      history = await createTelemetryStoreClient().queryEntity(
        node.id,
        node.kind,
        window as TelemetryHistoryWindow,
      );
    } catch {
      return Response.json({ error: 'HISTORY_STORE_UNAVAILABLE' }, { status: 503 });
    }
  }
  return Response.json(
    {
      targetId: node.id,
      targetType: node.kind,
      serialNumber: node.serialNumber ?? null,
      status: entityTelemetryStatus(bindings.length > 0, sample),
      sample,
      history,
      sources: bindings.map((b) => ({ sourceIdentity: b.sourceIdentity, bindingId: b.id })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
