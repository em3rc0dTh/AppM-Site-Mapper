import { requirePermission } from '@/modules/identity/application/current-session';
import {
  assessBdfbInventory,
  bdfbHardwareProfile,
} from '@/modules/power/domain/bdfb-hardware-profile';
import { summarizeSnmpBdfbLoad } from '@/modules/telemetry/application/snmp-feed-service';
import {
  projectVerifiedQdfVoltage,
  qdfVoltageToleranceV,
  type QdfVoltageFeedEvidence,
} from '@/modules/telemetry/application/qdf-total-voltage';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
import { isBdfbFeedPort } from '@/modules/telemetry/application/snmp-feed-service';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { getTelemetryRuntime } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requirePermission('telemetry:read');
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId || deviceId.length > 128) {
    return Response.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }
  const telemetry = await getTelemetryRuntime();
  const topology = await createTopologyRepository();
  let historyAvailable = true;
  if (process.env.TELEMETRY_HISTORY_ENABLED === 'true') {
    const ports = (await topology.listEquipmentForDevice(deviceId))
      .filter((node) => node.lifecycle === 'ACTIVE')
      .flatMap((node) => node.accessPorts.filter(isBdfbFeedPort).map((port) => port.id));
    if (ports.length) {
      try {
        const recovered = await createTelemetryStoreClient().queryLatestEntities(
          ports,
          'ACCESS_PORT',
        );
        for (const sample of recovered) {
          if (sample.protocol !== 'SNMP' || !ports.includes(sample.targetId)) continue;
          const current = telemetry.hub.latest(sample.targetId);
          if (!current || current.receivedAt < sample.receivedAt) telemetry.hub.publish(sample);
        }
      } catch {
        historyAvailable = false;
      }
    }
  }
  const bindingRepo = await createTelemetryBindingRepository();
  const result = await summarizeSnmpBdfbLoad(deviceId, topology, bindingRepo, telemetry.hub);
  if (!result) return Response.json({ error: 'BDFB_NOT_FOUND' }, { status: 404 });

  const device = await topology.getById(deviceId);
  const equipment = (await topology.listEquipmentForDevice(deviceId)).filter(
    (node) => node.lifecycle === 'ACTIVE',
  );
  const portById = new Map(
    equipment.flatMap((node) => node.accessPorts.map((port) => [port.id, port] as const)),
  );
  const profile = device?.kind === 'DEVICE' ? bdfbHardwareProfile(device) : null;
  const assessment = profile ? assessBdfbInventory(profile, equipment) : null;
  const toleranceV =
    device?.kind === 'DEVICE' ? qdfVoltageToleranceV(device.attributes) : null;
  const now = Date.now();
  const voltageEvidence: QdfVoltageFeedEvidence[] = [];
  for (const feed of result.feeds) {
    const active = (await bindingRepo.listForTarget('ACCESS_PORT', feed.accessPortId)).filter(
      (binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'SNMP',
    );
    const voltageBindings = active.filter((binding) => binding.metric === 'VOLTAGE');
    const voltageBinding = voltageBindings.length === 1 ? voltageBindings[0]! : null;
    const sample = telemetry.hub.latest(feed.accessPortId);
    const raw = sample?.reported.voltageV;
    const reading =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as { value?: unknown; oid?: unknown; observedAt?: unknown })
        : null;
    const observedAt =
      typeof reading?.observedAt === 'string' && Number.isFinite(Date.parse(reading.observedAt))
        ? reading.observedAt
        : null;
    const age = observedAt ? now - Date.parse(observedAt) : Infinity;
    const permitted =
      Boolean(voltageBinding) &&
      sample?.sourceIdentity === voltageBinding?.sourceIdentity &&
      typeof reading?.value === 'number' &&
      Number.isFinite(reading.value) &&
      reading.oid === voltageBinding?.sourcePointId &&
      age >= -60_000 &&
      age <= 90_000;
    voltageEvidence.push({
      accessPortId: feed.accessPortId,
      side: feed.side === 'A' || feed.side === 'B' ? feed.side : null,
      position: feed.feedPosition ?? feed.side,
      verified:
        portById.get(feed.accessPortId)?.attributes?.independentInputConfirmed === true &&
        voltageBindings.length === 1 &&
        permitted,
      sourceMode:
        voltageBinding?.attributes?.commissioning === 'SYNTHETIC_LAB_ONLY'
          ? 'SYNTHETIC_LAB_ONLY'
          : 'FIELD',
      voltageV: permitted ? (reading!.value as number) : null,
      observedAt,
    });
  }

  const voltageContract =
    assessment && toleranceV !== null
      ? projectVerifiedQdfVoltage(
          voltageEvidence,
          assessment.expectedFeedCount,
          assessment.inventoryComplete,
          toleranceV,
        )
      : { busA: null, busB: null, total: null };

  return Response.json(
    {
      ...result,
      historyAvailable,
      voltageContract: {
        toleranceV,
        semantics: 'COHERENT_REPRESENTATIVE_A_B_BUS_VOLTAGE',
        ...voltageContract,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
