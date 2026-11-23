import { requirePermission } from '@/modules/identity/application/current-session';
import { controllerProfileFromAttributes } from '@/modules/telemetry/domain/snmp-controller-profile';
import {
  configuredTrapSources,
  parseTrapCursor,
} from '@/modules/telemetry/domain/industrial/trap-view';
import {
  getObservationStore,
  industrialProfiles,
} from '@/modules/telemetry/infrastructure/industrial/runtime';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only sources explicitly associated to this active BDFB may be shown. */
export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const deviceId = params.get('deviceId');
  const cursorText = params.get('cursor');
  const cursor = parseTrapCursor(cursorText);
  if (!deviceId || deviceId.length > 128 || (cursorText !== null && !cursor))
    return Response.json({ error: 'INVALID_TRAP_QUERY' }, { status: 400 });
  try {
    const repository = await createTopologyRepository();
    const device = await repository.getById(deviceId);
    if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
      return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
    const profiles = industrialProfiles().filter((profile) => profile.protocol === 'SNMP');
    const available = new Set(profiles.map((profile) => profile.sourceIdentity));
    const equipment = (await repository.listEquipmentForDevice(deviceId)).filter(
      (node) => node.lifecycle === 'ACTIVE',
    );
    const equipmentIds = new Set(equipment.map((node) => node.id));
    const portIds = new Set(
      equipment.flatMap((node) =>
        node.accessPorts.filter((port) => port.lifecycle === 'ACTIVE').map((port) => port.id),
      ),
    );

    // Reuse the authoritative SNMP telemetry bindings. TRAP and polling are
    // transports of one source: there is no second commissioning action.
    const bindings = await (await createTelemetryBindingRepository()).listActiveByProtocol('SNMP');
    const linkedSources = bindings
      .filter((binding) =>
        binding.lifecycle === 'ACTIVE' &&
        ((binding.targetType === 'DEVICE' && binding.targetId === deviceId) ||
          (binding.targetType === 'EQUIPMENT' && equipmentIds.has(binding.targetId)) ||
          (binding.targetType === 'ACCESS_PORT' && portIds.has(binding.targetId))),
      )
      .map((binding) => binding.sourceIdentity);

    const controller = controllerProfileFromAttributes(device.attributes);
    const serialSources = profiles
      .filter((profile) =>
        [device, ...equipment].some((node) => node.serialNumber === profile.sourceIdentity),
      )
      .map((profile) => profile.sourceIdentity);
    const verifiedSerialSources = (
      await Promise.all(
        serialSources.map(async (sourceIdentity) => {
          const matches = await repository.findActiveBySerialNumber(sourceIdentity);
          return matches.length === 1 ? sourceIdentity : null;
        }),
      )
    ).filter((source): source is string => source !== null);

    const sourceNames = [
      ...new Set([
        // Keep legacy declarations readable; no manual configuration required.
        ...configuredTrapSources(device.attributes),
        ...linkedSources,
        ...profiles
          .filter((profile) => profile.targetId === deviceId || equipmentIds.has(profile.targetId ?? ''))
          .map((profile) => profile.sourceIdentity),
        ...verifiedSerialSources,
        ...(controller ? [controller.sourceIdentity] : []),
      ]),
    ].filter((source) => available.has(source));

    const store = await getObservationStore();
    const page = await store.listTraps(sourceNames, 30, cursor ?? undefined);
    return Response.json(
      { ...page, sourceConfigured: sourceNames.length > 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json({ error: 'TRAP_HISTORY_UNAVAILABLE' }, { status: 503 });
  }
}
