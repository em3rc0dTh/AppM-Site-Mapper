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

/** Inherit SNMP source authority from existing inventory and telemetry bindings. */
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
      .filter(
        (binding) =>
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
          .filter(
            (profile) => profile.targetId === deviceId || equipmentIds.has(profile.targetId ?? ''),
          )
          .map((profile) => profile.sourceIdentity),
        ...verifiedSerialSources,
        ...(controller ? [controller.sourceIdentity] : []),
      ]),
    ].filter((source) => available.has(source));

    // A source bound to a different QDF is ambiguous: never duplicate its
    // notifications across dashboards. Source identity is not a QDF label.
    const validatedSources: string[] = [];
    for (const source of sourceNames) {
      const foreign = bindings.filter((binding) => binding.sourceIdentity === source);
      let belongsElsewhere = false;
      for (const binding of foreign) {
        if (binding.targetType === 'DEVICE') {
          if (binding.targetId !== deviceId) belongsElsewhere = true;
        } else if (binding.targetType === 'EQUIPMENT') {
          const owner = await repository.getById(binding.targetId);
          if (owner?.kind !== 'EQUIPMENT' || owner.deviceId !== deviceId) belongsElsewhere = true;
        } else if (binding.targetType === 'ACCESS_PORT') {
          const owner = await repository.getEquipmentByAccessPortId(binding.targetId);
          if (!owner || owner.deviceId !== deviceId) belongsElsewhere = true;
        }
        if (belongsElsewhere) break;
      }
      if (!belongsElsewhere) validatedSources.push(source);
    }

    const store = await getObservationStore();
    const page = await store.listTraps(validatedSources, 30, cursor ?? undefined);
    // Keep historical ON/OFF separate from the last recorded condition.
    const conditionIds = [...new Set(page.events.flatMap((event) =>
      event.conditionSignalId ? [event.conditionSignalId] : []))];
    let events = page.events;
    if (conditionIds.length) {
      try {
        const conditions = new Map((await store.byIds(conditionIds)).map((s) => [s.id, s]));
        events = page.events.map((event) => {
          const condition = event.conditionSignalId ? conditions.get(event.conditionSignalId) : undefined;
          const matched = condition && condition.sourceIdentity === event.sourceIdentity &&
            condition.protocol === 'SNMP' && condition.kind === 'alarm' &&
            condition.key === event.conditionKey &&
            (condition.alarmState === 'ACTIVE' || condition.alarmState === 'RESOLVED') &&
            condition.quality === 'VALID';
          return {
            ...event,
            lastConditionState: matched ? condition!.alarmState as 'ACTIVE' | 'RESOLVED' : null,
            lastConditionObservedAt: matched ? condition!.alarmObservedAt ?? condition!.observedAt : null,
          };
        });
      } catch {
        // The original event remains available if the condition lookup fails.
      }
    }
    return Response.json(
      { ...page, events, sourceConfigured: validatedSources.length > 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json({ error: 'TRAP_HISTORY_UNAVAILABLE' }, { status: 503 });
  }
}
