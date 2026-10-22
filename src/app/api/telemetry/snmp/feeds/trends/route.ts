import { requirePermission } from '@/modules/identity/application/current-session';
import { isBdfbFeedPort } from '@/modules/telemetry/application/snmp-feed-service';
import { TELEMETRY_HISTORY_WINDOWS, type TelemetryHistoryWindow } from '@/modules/telemetry/domain/history';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const deviceId = params.get('deviceId');
  const window = params.get('window');
  if (!deviceId || deviceId.length > 128 || !window ||
      !TELEMETRY_HISTORY_WINDOWS.includes(window as TelemetryHistoryWindow))
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  if (process.env.TELEMETRY_HISTORY_ENABLED !== 'true')
    return Response.json({ error: 'HISTORY_STORE_DISABLED' }, { status: 503 });

  const topology = await createTopologyRepository();
  const device = await topology.getById(deviceId);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });

  const ports = (await topology.listEquipmentForDevice(deviceId))
    .filter((item) => item.lifecycle === 'ACTIVE')
    .flatMap((equipment) => equipment.accessPorts.filter(isBdfbFeedPort))
    .slice(0, 4);
  const bindings = await createTelemetryBindingRepository();
  const history = createTelemetryStoreClient();
  try {
    const feeds = await Promise.all(ports.map(async (port) => {
      const active = (await bindings.listForTarget('ACCESS_PORT', port.id))
        .filter((binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'SNMP');
      const currents = active.filter((item) => item.metric === 'CURRENT');
      const voltages = active.filter((item) => item.metric === 'VOLTAGE');
      // Never merge two different controllers or ambiguous OID assignments.
      const source = currents.length === 1 ? currents[0]!.sourceIdentity : null;
      const compatible = source && voltages.length <= 1 &&
        (voltages.length === 0 || voltages[0]!.sourceIdentity === source);
      const points = compatible
        ? await history.querySnmpFeedSeries(port.id, source, window as TelemetryHistoryWindow)
        : [];
      return {
        accessPortId: port.id,
        label: port.name,
        side: port.attributes?.feed ?? null,
        feedPosition: port.attributes?.feedPosition ?? null,
        sourceMode: currents[0]?.attributes?.commissioning === 'SYNTHETIC_LAB_ONLY'
          ? 'SYNTHETIC_LAB_ONLY' : 'FIELD',
        points,
      };
    }));
    return Response.json({
      deviceId, window, feeds, energySource: 'ESTIMATED_FROM_PAIRED_VOLTAGE_CURRENT',
      maxIntegratedGapSeconds: 120,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return Response.json({ error: 'SNMP_HISTORY_UNAVAILABLE' }, { status: 503 });
  }
}
