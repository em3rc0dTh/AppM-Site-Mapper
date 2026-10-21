import { requirePermission } from '@/modules/identity/application/current-session';
import { summarizeSnmpBdfbLoad } from '@/modules/telemetry/application/snmp-feed-service';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { isBdfbFeedPort } from '@/modules/telemetry/application/snmp-feed-service';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
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
  const topology = await createTopologyRepository();
  let historyAvailable = true;
  if (process.env.TELEMETRY_HISTORY_ENABLED === 'true') {
    const ports = (await topology.listEquipmentForDevice(deviceId))
      .filter((node) => node.lifecycle === 'ACTIVE')
      .flatMap((node) => node.accessPorts.filter(isBdfbFeedPort).map((port) => port.id));
    if (ports.length) {
      try {
        const recovered = await createTelemetryStoreClient().queryLatestEntities(ports, 'ACCESS_PORT');
        for (const sample of recovered) {
          if (sample.protocol !== 'SNMP' || !ports.includes(sample.targetId)) continue;
          const current = telemetry.hub.latest(sample.targetId);
          if (!current || current.receivedAt < sample.receivedAt) telemetry.hub.publish(sample);
        }
      } catch {
        historyAvailable = false;
      }
    }
  }
  const result = await summarizeSnmpBdfbLoad(
    deviceId, topology, await createTelemetryBindingRepository(), telemetry.hub,
  );
  return result
    ? Response.json({ ...result, historyAvailable }, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
}
