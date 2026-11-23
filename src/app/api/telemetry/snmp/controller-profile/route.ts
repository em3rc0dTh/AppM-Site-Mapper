import { requirePermission } from '@/modules/identity/application/current-session';
import {
  controllerProfileFromAttributes,
  parseSnmpControllerProfile,
} from '@/modules/telemetry/domain/snmp-controller-profile';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { nowIso } from '@/shared/domain/entity';
import { integrityErrorResponse } from '@/shared/http/integrity-error';
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
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId || deviceId.length > 128)
    return Response.json({ error: 'INVALID_DEVICE_ID' }, { status: 400 });
  const topology = await createTopologyRepository();
  const device = await topology.getById(deviceId);
  if (device?.kind !== 'DEVICE' || device.lifecycle !== 'ACTIVE' || device.deviceType !== 'BDFB')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  const [topologyWrite, powerWrite] = await Promise.all([
    requirePermission('topology:write'),
    requirePermission('power:write'),
  ]);
  return Response.json(
    {
      deviceId,
      profile: controllerProfileFromAttributes(device.attributes),
      canConfigure: topologyWrite.ok && powerWrite.ok,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

async function saveProfile(request: Request) {
  const [topologyWrite, powerWrite] = await Promise.all([
    requirePermission('topology:write'),
    requirePermission('power:write'),
  ]);
  if (!topologyWrite.ok || !powerWrite.ok)
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 6144, maxDepth: 5, maxNodes: 100 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const body = parsed.value;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !hasOnlyKeys(body as Record<string, unknown>, ['deviceId', 'profile', 'confirmConfiguration'])
  )
    return Response.json({ error: 'INVALID_CONTROLLER_REQUEST' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const profile = parseSnmpControllerProfile(input.profile);
  if (
    !isBoundedString(input.deviceId, 128) ||
    input.confirmConfiguration !== true ||
    !profile
  )
    return Response.json({ error: 'INVALID_CONTROLLER_PROFILE' }, { status: 400 });

  const topology = await createTopologyRepository();
  const device = await topology.getById(input.deviceId);
  if (device?.kind !== 'DEVICE' || device.lifecycle !== 'ACTIVE' || device.deviceType !== 'BDFB')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });

  const previous = controllerProfileFromAttributes(device.attributes);
  if (previous && JSON.stringify(previous) === JSON.stringify(profile))
    return Response.json({ profile, alreadyConfigured: true });

  const changed = {
    ...device,
    attributes: {
      ...device.attributes,
      snmpControllerProfile: profile,
      // Bounded inline change history. Never store credentials or telemetry readings here.
      snmpControllerProfileHistory: [
        ...(
          Array.isArray(device.attributes?.snmpControllerProfileHistory)
            ? device.attributes.snmpControllerProfileHistory
            : []
        ).slice(-9),
        {
          changedAt: nowIso(),
          previous,
        },
      ],
    },
    updatedAt: nowIso(),
  };
  if (!topology.replaceIfVersion || !(await topology.replaceIfVersion(changed, device.updatedAt)))
    return Response.json({ error: 'CONTROLLER_PROFILE_CONFLICT' }, { status: 409 });
  return Response.json({ profile, saved: true }, { status: 201 });
}

export async function POST(request: Request) {
  try {
    return await saveProfile(request);
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
