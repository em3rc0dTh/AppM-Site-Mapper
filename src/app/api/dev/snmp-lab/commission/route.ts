import { randomUUID } from 'node:crypto';

import { isProductionDeployment } from '@/config/env';
import { requirePermission } from '@/modules/identity/application/current-session';
import {
  assessBdfbInventory,
  bdfbHardwareProfile,
  ELTEK_BDCBB_CONFIG_2,
  ELTEK_BDCBB_CONFIG_4,
  config4FeedPosition,
} from '@/modules/power/domain/bdfb-hardware-profile';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { isBdfbFeedPort } from '@/modules/telemetry/application/snmp-feed-service';
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

function labEnabled(): boolean {
  // NODE_ENV is production even in local Next.js Docker builds; APP_ENV is
  // the explicit deployment security authority. Keep this endpoint disabled
  // in staging, production and all non-opted-in environments.
  return process.env.APP_ENV === 'development' &&
    process.env.SNMP_LAB_ENABLED === 'true' && !isProductionDeployment();
}

function labSourceForDevice(name: string): string | null {
  const matched = /^BDFB-(0[123])$/i.exec(name.trim());
  return matched ? `EMU-DELTA-BFDB-${matched[1]}` : null;
}

type LabSlot = Readonly<{ feed: string; currentOid: string; voltageOid: string }>;
function labSlots(profile: string): readonly LabSlot[] {
  const suffix = profile === ELTEK_BDCBB_CONFIG_2 ? '48' : '49';
  const positions = profile === ELTEK_BDCBB_CONFIG_2 ? ['A', 'B'] : ['A1', 'A2', 'B1', 'B2'];
  return positions.map((feed, index) => ({
    feed,
    currentOid: `1.3.6.1.4.1.8072.9999.2026.${suffix}.1.${index + 1}.0`,
    voltageOid: `1.3.6.1.4.1.8072.9999.2026.${suffix}.2.${index + 1}.0`,
  }));
}

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  if (!labEnabled()) return Response.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId || deviceId.length > 128) return Response.json({ enabled: false });
  const topology = await createTopologyRepository();
  const device = await topology.getById(deviceId);
  const enabled = device?.kind === 'DEVICE' && device.lifecycle === 'ACTIVE' &&
    device.deviceType === 'BDFB' && labSourceForDevice(device.name) !== null &&
    bdfbHardwareProfile(device) !== null;
  return Response.json({ enabled, sourceIdentity: enabled ? labSourceForDevice(device.name) : null },
    { headers: { 'Cache-Control': 'private, no-store' } });
}

/** Explicit opt-in lab mapping. It never sets physical wiring verification. */
export async function POST(request: Request) {
  const auth = await requirePermission('topology:write');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
  const power = await requirePermission('power:write');
  if (!power.ok) return Response.json({ error: power.error }, { status: 403 });
  if (!labEnabled()) return Response.json({ error: 'SYNTHETIC_LAB_DISABLED' }, { status: 404 });
  if (!isSafeMutationRequest(request))
    return Response.json({ error: 'INVALID_ORIGIN' }, { status: 403 });
  const parsed = await readBoundedJson(request, { maxBytes: 512, maxDepth: 2, maxNodes: 8 });
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: jsonBodyErrorStatus(parsed.error) });
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !hasOnlyKeys(body, ['deviceId', 'confirmSyntheticOnly']) ||
      !isBoundedString(body.deviceId, 128) || body.confirmSyntheticOnly !== true)
    return Response.json({ error: 'INVALID_SYNTHETIC_CONFIRMATION' }, { status: 400 });

  const topology = await createTopologyRepository();
  const device = await topology.getById(body.deviceId);
  if (device?.kind !== 'DEVICE' || device.lifecycle !== 'ACTIVE' || device.deviceType !== 'BDFB')
    return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });
  const sourceIdentity = labSourceForDevice(device.name);
  const profile = bdfbHardwareProfile(device);
  if (!sourceIdentity || (profile !== ELTEK_BDCBB_CONFIG_2 && profile !== ELTEK_BDCBB_CONFIG_4))
    return Response.json({ error: 'LAB_DEVICE_OR_PROFILE_NOT_SUPPORTED' }, { status: 422 });

  const equipment = (await topology.listEquipmentForDevice(device.id)).filter(
    (node) => node.lifecycle === 'ACTIVE',
  );
  const assessment = assessBdfbInventory(profile, equipment);
  // Only the absence of field wiring verification is waived in an explicitly
  // synthetic lab. Every other physical topology, shunt and panel rule stays.
  const nonLabIssues = assessment.issues.filter(
    (issue) => !issue.startsWith('SHUNT_NOT_VERIFIED_') &&
      !(profile === ELTEK_BDCBB_CONFIG_4 && issue.startsWith('RATING_NOT_CONFIRMED_')) &&
      !(profile === ELTEK_BDCBB_CONFIG_4 && issue.startsWith('SHUNT_SPEC_NOT_CONFIRMED_')),
  );
  if (assessment.missingFeedPositions.length || nonLabIssues.length)
    return Response.json({ error: 'LAB_INVENTORY_INCOMPLETE', issues: nonLabIssues,
      missingInputs: assessment.missingFeedPositions }, { status: 422 });

  const ports = equipment.flatMap((owner) => owner.accessPorts.filter(isBdfbFeedPort));
  const plan = labSlots(profile).flatMap((slot) => {
    const port = ports.find((candidate) => (profile === ELTEK_BDCBB_CONFIG_2
      ? candidate.attributes?.feed : config4FeedPosition(candidate)) === slot.feed);
    if (!port) return [];
    return [
      { port, metric: 'CURRENT', oid: slot.currentOid, unit: 'A' },
      { port, metric: 'VOLTAGE', oid: slot.voltageOid, unit: 'V' },
    ];
  });
  if (plan.length !== assessment.expectedFeedCount * 2)
    return Response.json({ error: 'LAB_PORT_MAPPING_INCOMPLETE' }, { status: 422 });

  const repository = await createTelemetryBindingRepository();
  const [sourceBindings, targetBindings] = await Promise.all([
    repository.listForSource('SNMP', sourceIdentity),
    Promise.all(ports.map(async (port) => ({ portId: port.id,
      bindings: await repository.listForTarget('ACCESS_PORT', port.id) }))),
  ]);
  // Preflight the entire plan before any insert to avoid stealing genuine
  // instrument OIDs or overwriting physical commissioning.
  for (const target of plan) {
    const forSource = sourceBindings.filter((binding) => binding.lifecycle === 'ACTIVE' &&
      binding.sourcePointId === target.oid && binding.metric === target.metric);
    const forPort = targetBindings.find((item) => item.portId === target.port.id)!.bindings
      .filter((binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'SNMP' &&
        binding.metric === target.metric);
    const same = forSource.length === 1 && forPort.length === 1 &&
      forSource[0]!.id === forPort[0]!.id &&
      forSource[0]!.targetId === target.port.id &&
      forSource[0]!.attributes?.commissioning === 'SYNTHETIC_LAB_ONLY';
    if (!same && (forSource.length || forPort.length))
      return Response.json({ error: 'EXISTING_SNMP_BINDING_CONFLICT',
        feed: target.port.name, metric: target.metric }, { status: 409 });
  }

  let created = 0;
  for (const target of plan) {
    const existing = sourceBindings.some((binding) =>
      binding.lifecycle === 'ACTIVE' && binding.sourcePointId === target.oid &&
      binding.metric === target.metric && binding.targetId === target.port.id &&
      binding.attributes?.commissioning === 'SYNTHETIC_LAB_ONLY');
    if (existing) continue;
    const now = new Date().toISOString();
    const binding: TelemetryBinding = {
      id: randomUUID(), lifecycle: 'ACTIVE', createdAt: now, updatedAt: now,
      protocol: 'SNMP', sourceIdentity, sourcePointId: target.oid,
      metric: target.metric, unit: target.unit,
      targetType: 'ACCESS_PORT', targetId: target.port.id,
      attributes: { commissioning: 'SYNTHETIC_LAB_ONLY',
        bdfbDeviceId: device.id, equipmentId: target.port.equipmentId,
        feedName: target.port.name },
    };
    try {
      await repository.insert(binding);
      created += 1;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        return Response.json({ error: 'SNMP_BINDING_CONFLICT' }, { status: 409 });
      throw error;
    }
  }

  return Response.json({
    mode: 'SYNTHETIC_LAB_ONLY', sourceIdentity, profile,
    expectedPoints: plan.length, created,
    physicalVerification: false, instruction: 'Start the matching SNMP collector; no field current is certified.',
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
