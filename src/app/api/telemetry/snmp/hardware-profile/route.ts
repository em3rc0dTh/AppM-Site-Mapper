import { integrityErrorResponse } from '@/shared/http/integrity-error';
import { requirePermission } from '@/modules/identity/application/current-session';
import {
  assessBdfbInventory,
  ELTEK_BDCBB_CONFIG_2,
  bdfbHardwareProfile,
  ELTEK_BDCBB_CONFIG_4,
} from '@/modules/power/domain/bdfb-hardware-profile';
import { qdfVoltageToleranceV } from '@/modules/telemetry/application/qdf-total-voltage';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { nowIso } from '@/shared/domain/entity';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('topology:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const id = new URL(request.url).searchParams.get('deviceId');
  if (!id || id.length > 128) return Response.json({ error: 'INVALID_DEVICE_ID' }, { status: 400 });
  const topology = await createTopologyRepository();
  const device = await topology.getById(id);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  const selected = bdfbHardwareProfile(device);
  const inventory = selected
    ? assessBdfbInventory(selected, await topology.listEquipmentForDevice(id))
    : null;
  return Response.json(
    {
      deviceId: id,
      hardwareProfile: selected,
      voltageToleranceV: qdfVoltageToleranceV(device.attributes),
      inventory,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

async function handlePOST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
  const powerAuth = await requirePermission('power:write');
  if (!powerAuth.ok) return Response.json({ error: powerAuth.error }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 512, maxDepth: 2, maxNodes: 8 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const body = parsed.value;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !hasOnlyKeys(body as Record<string, unknown>, [
      'deviceId',
      'hardwareProfile',
      'confirmInstalledProfile',
      'voltageToleranceV',
    ])
  ) {
    return Response.json({ error: 'INVALID_PROFILE_REQUEST' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (
    !isBoundedString(input.deviceId, 128) ||
    (input.hardwareProfile !== ELTEK_BDCBB_CONFIG_2 &&
      input.hardwareProfile !== ELTEK_BDCBB_CONFIG_4) ||
    input.confirmInstalledProfile !== true ||
    (input.voltageToleranceV !== undefined &&
      (typeof input.voltageToleranceV !== 'number' ||
        !Number.isFinite(input.voltageToleranceV) ||
        input.voltageToleranceV <= 0 ||
        input.voltageToleranceV > 20))
  ) {
    return Response.json({ error: 'INVALID_PROFILE_REQUEST' }, { status: 400 });
  }
  const selectedProfile = input.hardwareProfile as
    typeof ELTEK_BDCBB_CONFIG_2 | typeof ELTEK_BDCBB_CONFIG_4;
  const requestedTolerance =
    typeof input.voltageToleranceV === 'number' ? input.voltageToleranceV : undefined;
  const topology = await createTopologyRepository();
  const device = await topology.getById(input.deviceId);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  const currentProfile = bdfbHardwareProfile(device);
  const currentTolerance = qdfVoltageToleranceV(device.attributes);
  if (
    currentProfile === selectedProfile &&
    (requestedTolerance === undefined || requestedTolerance === currentTolerance)
  )
    return Response.json({
      hardwareProfile: selectedProfile,
      voltageToleranceV: currentTolerance,
      alreadySelected: true,
    });

  // Never silently reinterpret existing OIDs when the physical layout changes.
  const equipment = await topology.listEquipmentForDevice(device.id);
  if (currentProfile !== selectedProfile) {
    const bindingsRepo = await (
      await import('@/modules/telemetry/infrastructure/telemetry-binding-repository-factory')
    ).createTelemetryBindingRepository();
    for (const owner of equipment) {
      for (const port of owner.accessPorts.filter((p) => p.lifecycle === 'ACTIVE')) {
        const bindings = await bindingsRepo.listForTarget('ACCESS_PORT', port.id);
        if (bindings.some((b) => b.lifecycle === 'ACTIVE' && b.protocol === 'SNMP'))
          return Response.json(
            { error: 'ACTIVE_SNMP_BINDINGS_REQUIRE_RETIREMENT' },
            { status: 409 },
          );
      }
    }
  }
  const changed = {
    ...device,
    attributes: {
      ...device.attributes,
      bdfbHardwareProfile: selectedProfile,
      ...(requestedTolerance !== undefined
        ? { qdfVoltageToleranceV: requestedTolerance }
        : {}),
    },
    updatedAt: nowIso(),
  };
  if (!topology.replaceIfVersion || !(await topology.replaceIfVersion(changed, device.updatedAt))) {
    return Response.json({ error: 'PROFILE_VERSION_CONFLICT' }, { status: 409 });
  }
  return Response.json(
    {
      hardwareProfile: selectedProfile,
      voltageToleranceV: qdfVoltageToleranceV(changed.attributes),
      inventory: assessBdfbInventory(selectedProfile, equipment),
    },
    { status: 201 },
  );
}

export async function POST(request: Request) {
  try {
    return await handlePOST(request);
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
