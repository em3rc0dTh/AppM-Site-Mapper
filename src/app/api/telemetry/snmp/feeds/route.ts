import { requirePermission } from '@/modules/identity/application/current-session';
import { summarizeSnmpBdfbLoad } from '@/modules/telemetry/application/snmp-feed-service';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId || deviceId.length > 128) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  const telemetry = await getTelemetryRuntime();
  const result = await summarizeSnmpBdfbLoad(
    deviceId,
    await createTopologyRepository(),
    await createTelemetryBindingRepository(),
    telemetry.hub,
  );
  return result
    ? Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
}
