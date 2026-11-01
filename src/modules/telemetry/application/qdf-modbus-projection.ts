import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import {
  isBdfbFeedPort,
  summarizeSnmpBdfbLoad,
} from '@/modules/telemetry/application/snmp-feed-service';
import { projectVerifiedLiveTotalCurrent } from '@/modules/telemetry/application/qdf-total-current';
import {
  projectVerifiedQdfVoltage,
  qdfVoltageToleranceV,
  type QdfVoltageFeedEvidence,
} from '@/modules/telemetry/application/qdf-total-voltage';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

export interface QdfTotalCurrentPublicationRequest {
  readonly signalId: string;
  readonly logicalPointId: string;
}

export interface QdfVoltagePublicationRequest {
  readonly signalId: string;
  readonly logicalPointId: string;
}

export interface LatestEntityTelemetry {
  queryLatestEntities(
    targetIds: readonly string[],
    targetType: TelemetrySample['targetType'],
  ): Promise<readonly TelemetrySample[]>;
}

export function parseQdfTotalCurrentLogicalPoint(
  logicalPointId: string,
): { deviceId: string } | null {
  const match = /^QDF\/([^/]{1,160})\/TOTAL_CURRENT$/.exec(logicalPointId);
  return match ? { deviceId: match[1]! } : null;
}

export type QdfVoltageLogicalPoint = 'BUS_A_VOLTAGE' | 'BUS_B_VOLTAGE' | 'TOTAL_VOLTAGE';

export function parseQdfVoltageLogicalPoint(
  logicalPointId: string,
): { deviceId: string; point: QdfVoltageLogicalPoint } | null {
  const match = /^QDF\/([^/]{1,160})\/(BUS_A_VOLTAGE|BUS_B_VOLTAGE|TOTAL_VOLTAGE)$/.exec(
    logicalPointId,
  );
  return match
    ? {
        deviceId: match[1]!,
        point: match[2]! as QdfVoltageLogicalPoint,
      }
    : null;
}

function unavailableQuality(
  load: Awaited<ReturnType<typeof summarizeSnmpBdfbLoad>>,
): Signal['quality'] {
  if (!load) return 'INVALID';
  if (load.feeds.some((feed) => feed.status === 'STALE')) return 'STALE';
  if (load.feeds.some((feed) => feed.status === 'NO_DATA')) return 'UNOBSERVED';
  if (load.feeds.some((feed) => ['UNMAPPED', 'UNVERIFIED', 'CONFLICT'].includes(feed.status)))
    return 'INVALID';
  return 'UNKNOWN';
}

export async function projectQdfTotalCurrentSignals(
  requests: readonly QdfTotalCurrentPublicationRequest[],
  topology: TopologyRepository,
  bindings: TelemetryBindingRepository,
  history: LatestEntityTelemetry,
  now = new Date(),
): Promise<Signal[]> {
  const output: Signal[] = [];

  for (const request of requests) {
    const parsed = parseQdfTotalCurrentLogicalPoint(request.logicalPointId);
    if (!parsed) continue;

    const device = await topology.getById(parsed.deviceId);
    const validDevice =
      device?.kind === 'DEVICE' && device.lifecycle === 'ACTIVE' && device.deviceType === 'BDFB';

    const ports = validDevice
      ? (await topology.listEquipmentForDevice(parsed.deviceId))
          .filter((node) => node.lifecycle === 'ACTIVE')
          .flatMap((node) => node.accessPorts.filter(isBdfbFeedPort).map((port) => port.id))
      : [];

    const hub = new TelemetryHub(Math.max(ports.length, 1));
    if (ports.length) {
      try {
        for (const sample of await history.queryLatestEntities(ports, 'ACCESS_PORT')) {
          if (sample.protocol === 'SNMP' && ports.includes(sample.targetId)) hub.publish(sample);
        }
      } catch {
        // Fail only this derived point closed; unrelated industrial/Alarm projections remain usable.
      }
    }

    const load = validDevice
      ? await summarizeSnmpBdfbLoad(parsed.deviceId, topology, bindings, hub, now.getTime())
      : null;
    const total = load ? projectVerifiedLiveTotalCurrent(load) : null;
    const quality: Signal['quality'] = total ? 'VALID' : unavailableQuality(load);
    const observedAt =
      total?.observedAt ??
      load?.feeds
        .map((feed) => feed.observedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ??
      now.toISOString();

    output.push({
      id: request.signalId,
      logicalPointId: request.logicalPointId,
      publicationSignalId: request.signalId,
      authoritative: true,
      key: request.logicalPointId,
      sourceIdentity: 'SITE_MAPPER_QDF_TOTAL',
      protocol: 'SNMP',
      targetId: parsed.deviceId,
      kind: 'measurement',
      mibName: null,
      interpretation: 'PROFILE',
      rawType: total ? 'derived-number' : 'unavailable',
      rawValue: total?.currentA ?? null,
      value: total?.currentA ?? null,
      unit: 'A',
      scale: null,
      quality,
      alarmState: null,
      severity: null,
      profileVersion: 'qdf-total-current-v1',
      receivedAt: now.toISOString(),
      observedAt,
      staleMs: 90_000,
      eventId: `qdf-total-current:${parsed.deviceId}:${observedAt}`,
      ...(load
        ? {
            derivedFrom: load.feeds
              .filter((feed) => feed.sourceIdentity && feed.currentOid)
              .map((feed) => `${feed.sourceIdentity}:${feed.currentOid}`),
          }
        : {}),
    });
  }

  return output;
}


function voltageMetric(reading: unknown): { value: number; oid: string; observedAt: string } | null {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) return null;
  const record = reading as Record<string, unknown>;
  if (
    typeof record.value !== 'number' ||
    !Number.isFinite(record.value) ||
    typeof record.oid !== 'string' ||
    !record.oid ||
    typeof record.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.observedAt))
  )
    return null;
  return { value: record.value, oid: record.oid, observedAt: record.observedAt };
}

export async function projectQdfVoltageSignals(
  requests: readonly QdfVoltagePublicationRequest[],
  topology: TopologyRepository,
  bindings: TelemetryBindingRepository,
  history: LatestEntityTelemetry,
  now = new Date(),
): Promise<Signal[]> {
  const output: Signal[] = [];
  const grouped = new Map<string, QdfVoltagePublicationRequest[]>();
  for (const request of requests) {
    const parsed = parseQdfVoltageLogicalPoint(request.logicalPointId);
    if (!parsed) continue;
    grouped.set(parsed.deviceId, [...(grouped.get(parsed.deviceId) ?? []), request]);
  }

  for (const [deviceId, deviceRequests] of grouped) {
    const device = await topology.getById(deviceId);
    const validDevice =
      device?.kind === 'DEVICE' && device.lifecycle === 'ACTIVE' && device.deviceType === 'BDFB';
    const equipment = validDevice
      ? (await topology.listEquipmentForDevice(deviceId)).filter((node) => node.lifecycle === 'ACTIVE')
      : [];
    const ports = equipment.flatMap((node) => node.accessPorts.filter(isBdfbFeedPort));
    let latestSamples: readonly TelemetrySample[] = [];
    try {
      if (ports.length)
        latestSamples = await history.queryLatestEntities(
          ports.map((port) => port.id),
          'ACCESS_PORT',
        );
    } catch {
      latestSamples = [];
    }

    const profile = validDevice
      ? (
          await import('@/modules/power/domain/bdfb-hardware-profile')
        ).bdfbHardwareProfile(device)
      : null;
    const assessment =
      validDevice && profile
        ? (
            await import('@/modules/power/domain/bdfb-hardware-profile')
          ).assessBdfbInventory(profile, equipment)
        : null;
    const toleranceV = validDevice ? qdfVoltageToleranceV(device.attributes) : null;
    const evidence: QdfVoltageFeedEvidence[] = [];
    const derivationBySide = new Map<'A' | 'B', string[]>();

    for (const port of ports) {
      const active = (await bindings.listForTarget('ACCESS_PORT', port.id)).filter(
        (binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'SNMP',
      );
      const voltageBindings = active.filter((binding) => binding.metric === 'VOLTAGE');
      const voltageBinding = voltageBindings.length === 1 ? voltageBindings[0]! : null;
      const sample = latestSamples.find(
        (candidate) =>
          candidate.protocol === 'SNMP' &&
          candidate.targetId === port.id &&
          voltageBinding &&
          candidate.sourceIdentity === voltageBinding.sourceIdentity,
      );
      const reading = voltageMetric(sample?.reported.voltageV);
      const sourceMode =
        voltageBinding?.attributes?.commissioning === 'SYNTHETIC_LAB_ONLY'
          ? ('SYNTHETIC_LAB_ONLY' as const)
          : ('FIELD' as const);
      const side =
        port.attributes?.feed === 'A' || port.attributes?.feed === 'B'
          ? port.attributes.feed
          : null;
      const age = reading ? now.getTime() - Date.parse(reading.observedAt) : Infinity;
      const permitted =
        Boolean(voltageBinding) &&
        Boolean(reading) &&
        reading?.oid === voltageBinding?.sourcePointId &&
        age >= -60_000 &&
        age <= 90_000;
      evidence.push({
        accessPortId: port.id,
        side,
        position:
          typeof port.attributes?.feedPosition === 'string' && port.attributes.feedPosition
            ? port.attributes.feedPosition
            : side,
        verified:
          port.attributes?.independentInputConfirmed === true &&
          voltageBindings.length === 1 &&
          permitted,
        sourceMode,
        voltageV: permitted ? reading!.value : null,
        observedAt: permitted ? reading!.observedAt : null,
      });
      if (permitted && side && voltageBinding?.sourcePointId) {
        derivationBySide.set(side, [
          ...(derivationBySide.get(side) ?? []),
          `${voltageBinding.sourceIdentity}:${voltageBinding.sourcePointId}`,
        ]);
      }
    }

    const snapshot =
      assessment && toleranceV !== null
        ? projectVerifiedQdfVoltage(
            evidence,
            assessment.expectedFeedCount,
            assessment.inventoryComplete,
            toleranceV,
          )
        : { busA: null, busB: null, total: null };

    for (const request of deviceRequests) {
      const parsed = parseQdfVoltageLogicalPoint(request.logicalPointId)!;
      const selected =
        parsed.point === 'BUS_A_VOLTAGE'
          ? snapshot.busA
          : parsed.point === 'BUS_B_VOLTAGE'
            ? snapshot.busB
            : snapshot.total;
      const relevantSides =
        parsed.point === 'BUS_A_VOLTAGE'
          ? (['A'] as const)
          : parsed.point === 'BUS_B_VOLTAGE'
            ? (['B'] as const)
            : (['A', 'B'] as const);
      const stale = evidence.some(
        (item) =>
          relevantSides.includes(item.side as 'A' | 'B') &&
          item.observedAt !== null &&
          now.getTime() - Date.parse(item.observedAt) > 90_000,
      );
      const quality: Signal['quality'] = selected
        ? 'VALID'
        : stale
          ? 'STALE'
          : toleranceV === null || !assessment?.inventoryComplete
            ? 'INVALID'
            : evidence.some(
                  (item) =>
                    relevantSides.includes(item.side as 'A' | 'B') &&
                    (!item.verified || item.sourceMode !== 'FIELD'),
                )
              ? 'INVALID'
              : 'UNKNOWN';
      const observedAt =
        selected?.observedAt ??
        evidence
          .filter((item) => relevantSides.includes(item.side as 'A' | 'B') && item.observedAt)
          .map((item) => item.observedAt!)
          .sort()
          .at(-1) ??
        now.toISOString();
      const derivedFrom = relevantSides.flatMap((side) => derivationBySide.get(side) ?? []);

      output.push({
        id: request.signalId,
        logicalPointId: request.logicalPointId,
        publicationSignalId: request.signalId,
        authoritative: true,
        key: request.logicalPointId,
        sourceIdentity: 'SITE_MAPPER_QDF_VOLTAGE',
        protocol: 'SNMP',
        targetId: deviceId,
        kind: 'measurement',
        mibName: null,
        interpretation: 'PROFILE',
        rawType: selected ? 'derived-number' : 'unavailable',
        rawValue: selected?.voltageV ?? null,
        value: selected?.voltageV ?? null,
        unit: 'V',
        scale: null,
        quality,
        alarmState: null,
        severity: null,
        profileVersion: 'qdf-total-voltage-v1',
        receivedAt: now.toISOString(),
        observedAt,
        staleMs: 90_000,
        eventId: `qdf-voltage:${deviceId}:${parsed.point}:${observedAt}`,
        ...(derivedFrom.length ? { derivedFrom } : {}),
      });
    }
  }

  return output;
}
