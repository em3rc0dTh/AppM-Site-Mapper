import {
  bdfbHardwareProfile,
  CONFIG_4_RATED_CURRENT_A,
  CONFIG_4_SHUNT_CURRENT_A,
  CONFIG_4_SHUNT_MV,
  config4FeedPosition,
} from '@/modules/power/domain/bdfb-hardware-profile';
import { randomUUID } from 'node:crypto';

import { requirePermission } from '@/modules/identity/application/current-session';
import {
  isBdfbFeedPort,
  resolveSnmpFeedPort,
} from '@/modules/telemetry/application/snmp-feed-service';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { parseSnmpFeedPacket, type SnmpFeedMetric } from '@/modules/telemetry/domain/snmp-feed';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import {
  hasOnlyKeys,
  isBoundedString,
  isSafeMutationRequest,
  jsonBodyErrorStatus,
  readBoundedJson,
} from '@/shared/http/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

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
  const selectedProfile = bdfbHardwareProfile(device);
  const repository = await createTelemetryBindingRepository();
  const equipment = (await topology.listEquipmentForDevice(deviceId)).filter(
    (node) => node.lifecycle === 'ACTIVE',
  );
  const ports = equipment.flatMap((owner) =>
    owner.accessPorts.filter(isBdfbFeedPort).map((port) => ({
      id: port.id,
      equipmentId: owner.id,
      name: port.name,
      side: port.attributes?.feed ?? null,
      feedPosition: config4FeedPosition(port),
      independentInputConfirmed: port.attributes?.independentInputConfirmed === true,
      ratedCurrentA: port.attributes?.ratedCurrentA ?? null,
      servedPanelIds: port.attributes?.servedPanelIds ?? [],
    })),
  );
  const commissioned = await Promise.all(
    ports.map(async (port) => ({
      ...port,
      bindings: (await repository.listForTarget('ACCESS_PORT', port.id))
        .filter((b) => b.lifecycle === 'ACTIVE' && b.protocol === 'SNMP')
        .map((b) => ({
          id: b.id,
          sourceIdentity: b.sourceIdentity,
          oid: b.sourcePointId,
          metric: b.metric,
          commissionedAt: b.createdAt,
        })),
    })),
  );
  const write = await requirePermission('topology:write');
  const power = await requirePermission('power:write');
  return Response.json(
    {
      deviceId,
      hardwareProfile: selectedProfile,
      canCommission: write.ok && power.ok,
      ports: commissioned,
    },
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
  const parsed = await readBoundedJson(request, { maxBytes: 2048, maxDepth: 2, maxNodes: 16 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });

  const data = parsed.value;
  if (
    !record(data) ||
    !hasOnlyKeys(data, [
      'deviceId',
      'feedAccessPortId',
      'sourceIdentity',
      'oid',
      'metric',
      'confirmPhysicalMapping',
    ]) ||
    !isBoundedString(data.deviceId, 128) ||
    !isBoundedString(data.feedAccessPortId, 128) ||
    data.confirmPhysicalMapping !== true ||
    (data.metric !== 'CURRENT' && data.metric !== 'VOLTAGE')
  )
    return Response.json({ error: 'INVALID_COMMISSIONING_REQUEST' }, { status: 400 });

  const metric = data.metric as SnmpFeedMetric;
  const mock = parseSnmpFeedPacket({
    schemaVersion: 1,
    sourceIdentity: data.sourceIdentity,
    observedAt: new Date().toISOString(),
    measurements: [{ oid: data.oid, metric, value: 0, unit: metric === 'CURRENT' ? 'A' : 'V' }],
  });
  if (!mock.ok) return Response.json({ error: 'INVALID_OID_OR_SOURCE' }, { status: 400 });

  const topology = await createTopologyRepository();
  const target = await resolveSnmpFeedPort(topology, data.feedAccessPortId, data.deviceId);
  if (!target) return Response.json({ error: 'INVALID_BDFB_INPUT_FEED' }, { status: 422 });
  const targetDevice = await topology.getById(data.deviceId);
  if (targetDevice?.kind === 'DEVICE' && bdfbHardwareProfile(targetDevice)) {
    const slot = config4FeedPosition(target.port);
    const panels = target.port.attributes?.servedPanelIds;
    if (
      !slot ||
      target.port.attributes?.feed !== slot[0] ||
      target.port.attributes?.independentInputConfirmed !== true ||
      target.port.attributes?.ratedCurrentA !== CONFIG_4_RATED_CURRENT_A ||
      target.port.attributes?.shuntRatedCurrentA !== CONFIG_4_SHUNT_CURRENT_A ||
      target.port.attributes?.shuntRatedMillivolts !== CONFIG_4_SHUNT_MV ||
      !Array.isArray(panels) ||
      panels.length !== 1
    ) {
      return Response.json({ error: 'CONFIG4_PHYSICAL_MAPPING_INCOMPLETE' }, { status: 422 });
    }
  }

  const repository = await createTelemetryBindingRepository();
  const [sourceBindings, targetBindings] = await Promise.all([
    repository.listForSource('SNMP', mock.value.sourceIdentity),
    repository.listForTarget('ACCESS_PORT', data.feedAccessPortId),
  ]);
  const same = sourceBindings.filter(
    (b) => b.sourcePointId === data.oid && b.metric === metric && b.lifecycle === 'ACTIVE',
  );
  if (same.length === 1 && same[0]!.targetId === data.feedAccessPortId) {
    return Response.json({ bindingId: same[0]!.id, alreadyCommissioned: true });
  }
  if (
    same.length ||
    targetBindings.some(
      (b) => b.lifecycle === 'ACTIVE' && b.protocol === 'SNMP' && b.metric === metric,
    )
  )
    return Response.json({ error: 'SNMP_BINDING_CONFLICT' }, { status: 409 });

  const now = new Date().toISOString();
  const binding: TelemetryBinding = {
    id: randomUUID(),
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    protocol: 'SNMP',
    sourceIdentity: mock.value.sourceIdentity,
    sourcePointId: data.oid as string,
    metric,
    targetType: 'ACCESS_PORT',
    targetId: data.feedAccessPortId,
    unit: metric === 'CURRENT' ? 'A' : 'V',
    attributes: {
      commissioning: 'EXPLICIT_OPERATOR_CONFIRMATION',
      bdfbDeviceId: data.deviceId,
      equipmentId: target.owner.id,
      feedName: target.port.name,
    },
  };
  try {
    await repository.insert(binding);
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000)
      throw error;
    return Response.json({ error: 'SNMP_BINDING_CONFLICT' }, { status: 409 });
  }
  return Response.json({ bindingId: binding.id, created: true }, { status: 201 });
}

/** Explicitly retire a binding, preserving its audit history. */
export async function DELETE(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
  const powerAuth = await requirePermission('power:write');
  if (!powerAuth.ok) return Response.json({ error: powerAuth.error }, { status: 403 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 1024, maxDepth: 2, maxNodes: 10 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const data = parsed.value;
  if (
    !record(data) ||
    !hasOnlyKeys(data, ['feedAccessPortId', 'bindingId', 'confirmRetirement']) ||
    !isBoundedString(data.feedAccessPortId, 160) ||
    !isBoundedString(data.bindingId, 160) ||
    data.confirmRetirement !== true
  )
    return Response.json({ error: 'INVALID_RETIREMENT_REQUEST' }, { status: 400 });
  const target = await resolveSnmpFeedPort(await createTopologyRepository(), data.feedAccessPortId);
  if (!target) return Response.json({ error: 'INVALID_BDFB_INPUT_FEED' }, { status: 422 });
  const repository = await createTelemetryBindingRepository();
  const binding = (await repository.listForTarget('ACCESS_PORT', data.feedAccessPortId)).find(
    (b) => b.id === data.bindingId && b.lifecycle === 'ACTIVE' && b.protocol === 'SNMP',
  );
  if (!binding) return Response.json({ error: 'BINDING_NOT_FOUND' }, { status: 404 });
  await repository.replace({
    ...binding,
    lifecycle: 'ARCHIVED',
    updatedAt: new Date().toISOString(),
  });
  return Response.json({ retired: true, bindingId: binding.id });
}
