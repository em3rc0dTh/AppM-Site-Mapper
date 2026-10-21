import { requirePermission } from '@/modules/identity/application/current-session';
import {
  assessConfig4Inventory,
  bdfbHardwareProfile,
  ELTEK_BDCBB_CONFIG_4,
} from '@/modules/power/domain/bdfb-hardware-profile';
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
    ? assessConfig4Inventory(await topology.listEquipmentForDevice(id))
    : null;
  return Response.json(
    { deviceId: id, hardwareProfile: selected, inventory },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
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
    ])
  ) {
    return Response.json({ error: 'INVALID_PROFILE_REQUEST' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  if (
    !isBoundedString(input.deviceId, 128) ||
    input.hardwareProfile !== ELTEK_BDCBB_CONFIG_4 ||
    input.confirmInstalledProfile !== true
  ) {
    return Response.json({ error: 'INVALID_PROFILE_REQUEST' }, { status: 400 });
  }
  const topology = await createTopologyRepository();
  const device = await topology.getById(input.deviceId);
  if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  if (bdfbHardwareProfile(device) === ELTEK_BDCBB_CONFIG_4)
    return Response.json({ hardwareProfile: ELTEK_BDCBB_CONFIG_4, alreadySelected: true });
  const changed = {
    ...device,
    attributes: { ...device.attributes, bdfbHardwareProfile: ELTEK_BDCBB_CONFIG_4 },
    updatedAt: nowIso(),
  };
  if (!topology.replaceIfVersion || !(await topology.replaceIfVersion(changed, device.updatedAt))) {
    return Response.json({ error: 'PROFILE_VERSION_CONFLICT' }, { status: 409 });
  }
  return Response.json(
    {
      hardwareProfile: ELTEK_BDCBB_CONFIG_4,
      inventory: assessConfig4Inventory(await topology.listEquipmentForDevice(device.id)),
    },
    { status: 201 },
  );
}
