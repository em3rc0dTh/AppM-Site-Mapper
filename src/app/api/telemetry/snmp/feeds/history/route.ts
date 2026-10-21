import { requirePermission } from '@/modules/identity/application/current-session';
import { resolveSnmpFeedPort } from '@/modules/telemetry/application/snmp-feed-service';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const portId = query.get('feedAccessPortId');
  const window = query.get('window');
  if (!portId || !window || !TELEMETRY_HISTORY_WINDOWS.includes(window as TelemetryHistoryWindow))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  const target = await resolveSnmpFeedPort(await createTopologyRepository(), portId);
  if (!target) return Response.json({ error: 'FEED_NOT_FOUND' }, { status: 404 });
  const bindings = (
    await (await createTelemetryBindingRepository()).listForTarget('ACCESS_PORT', portId)
  ).filter((b) => b.protocol === 'SNMP' && b.lifecycle === 'ACTIVE');
  if (!bindings.length) return Response.json({ error: 'UNMAPPED_FEED' }, { status: 409 });
  if (process.env.TELEMETRY_HISTORY_ENABLED !== 'true')
    return Response.json({ error: 'HISTORY_STORE_DISABLED' }, { status: 503 });
  try {
    const history = await createTelemetryStoreClient().queryEntity(
      portId,
      'ACCESS_PORT',
      window as TelemetryHistoryWindow,
    );
    return Response.json(
      { feedAccessPortId: portId, window, samples: history },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'HISTORY_STORE_UNAVAILABLE' }, { status: 503 });
  }
}
