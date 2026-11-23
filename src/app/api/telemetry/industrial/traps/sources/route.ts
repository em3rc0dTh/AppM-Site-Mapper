import { requirePermission } from '@/modules/identity/application/current-session';
import {
  configuredTrapSources,
  parseTrapSources,
} from '@/modules/telemetry/domain/industrial/trap-view';
import { industrialProfiles } from '@/modules/telemetry/infrastructure/industrial/runtime';
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

async function requireOperator() {
  const [topology, power] = await Promise.all([
    requirePermission('topology:write'),
    requirePermission('power:write'),
  ]);
  return topology.ok && power.ok;
}

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId || deviceId.length > 128)
    return Response.json({ error: 'INVALID_DEVICE_ID' }, { status: 400 });
  try {
    const topology = await createTopologyRepository();
    const device = await topology.getById(deviceId);
    if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
      return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
    const canConfigure = await requireOperator();
    return Response.json(
      {
        sources: configuredTrapSources(device.attributes),
        availableSources: canConfigure
          ? industrialProfiles()
              .filter((profile) => profile.protocol === 'SNMP')
              .map((profile) => profile.sourceIdentity)
          : [],
        canConfigure,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json({ error: 'TRAP_SOURCE_UNAVAILABLE' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await requireOperator())) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 2048, maxDepth: 3, maxNodes: 30 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const body = parsed.value;
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !hasOnlyKeys(body as Record<string, unknown>, ['deviceId', 'sources', 'confirmMapping'])
  )
    return Response.json({ error: 'INVALID_SOURCE_REQUEST' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const sources = parseTrapSources(input.sources);
  if (!isBoundedString(input.deviceId, 128) || !sources || input.confirmMapping !== true)
    return Response.json({ error: 'INVALID_TRAP_SOURCES' }, { status: 400 });
  try {
    const allowed = new Set(
      industrialProfiles()
        .filter((profile) => profile.protocol === 'SNMP')
        .map((profile) => profile.sourceIdentity),
    );
    if (sources.some((source) => !allowed.has(source)))
      return Response.json({ error: 'SOURCE_NOT_COMMISSIONED' }, { status: 400 });
    const topology = await createTopologyRepository();
    const device = await topology.getById(input.deviceId);
    if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' || device.lifecycle !== 'ACTIVE')
      return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
    const previous = configuredTrapSources(device.attributes);
    if (JSON.stringify(previous) === JSON.stringify(sources))
      return Response.json({ sources, alreadyConfigured: true });
    const history = device.attributes?.snmpTrapSourceHistory;
    const updatedAt = nowIso();
    const changed = {
      ...device,
      attributes: {
        ...device.attributes,
        snmpTrapSourceIdentities: sources,
        snmpTrapSourceHistory: [
          ...(Array.isArray(history) ? history.slice(-9) : []),
          { previous, changedAt: updatedAt },
        ],
      },
      updatedAt,
    };
    if (!topology.replaceIfVersion || !(await topology.replaceIfVersion(changed, device.updatedAt)))
      return Response.json({ error: 'TRAP_SOURCE_CONFLICT' }, { status: 409 });
    return Response.json({ sources, saved: true }, { status: 201 });
  } catch (error) {
    return integrityErrorResponse(error);
  }
}
