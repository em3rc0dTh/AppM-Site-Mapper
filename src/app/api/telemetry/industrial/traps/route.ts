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
    const configured = configuredTrapSources(device.attributes);
    const controller = controllerProfileFromAttributes(device.attributes);
    const sourceNames = [
      ...new Set([
        ...configured,
        ...profiles
          .filter((profile) => profile.targetId === deviceId)
          .map((profile) => profile.sourceIdentity),
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
