import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import {
  isBdfbFeedPort,
  summarizeSnmpBdfbLoad,
} from '@/modules/telemetry/application/snmp-feed-service';
import { projectVerifiedLiveTotalCurrent } from '@/modules/telemetry/application/qdf-total-current';
import {
  projectVerifiedLiveTotalPower,
  type QdfLiveFeedPowerEvidence,
} from '@/modules/telemetry/application/qdf-total-power';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

export interface QdfTotalCurrentPublicationRequest {
  readonly signalId: string;
  readonly logicalPointId: string;
}

export interface QdfTotalPowerPublicationRequest {
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

export function parseQdfTotalPowerLogicalPoint(
  logicalPointId: string,
): { deviceId: string } | null {
  const match = /^QDF\/([^/]{1,160})\/TOTAL_POWER$/.exec(logicalPointId);
  return match ? { deviceId: match[1]! } : null;
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

function bindingMode(
  attributes: Readonly<Record<string, unknown>> | undefined,
): 'SYNTHETIC_LAB_ONLY' | 'FIELD' {
  return attributes?.commissioning === 'SYNTHETIC_LAB_ONLY' ? 'SYNTHETIC_LAB_ONLY' : 'FIELD';
}

function metricObservedAt(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  return typeof record.observedAt === 'string' && Number.isFinite(Date.parse(record.observedAt))
    ? record.observedAt
    : null;
}

export async function projectQdfTotalPowerSignals(
  requests: readonly QdfTotalPowerPublicationRequest[],
  topology: TopologyRepository,
  bindings: TelemetryBindingRepository,
  history: LatestEntityTelemetry,
  now = new Date(),
): Promise<Signal[]> {
  const output: Signal[] = [];

  for (const request of requests) {
    const parsed = parseQdfTotalPowerLogicalPoint(request.logicalPointId);
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
    let latestSamples: readonly TelemetrySample[] = [];
    if (ports.length) {
      try {
        latestSamples = await history.queryLatestEntities(ports, 'ACCESS_PORT');
        for (const sample of latestSamples) {
          if (sample.protocol === 'SNMP' && ports.includes(sample.targetId)) hub.publish(sample);
        }
      } catch {
        // Fail only this derived point closed; unrelated industrial/Alarm projections remain usable.
      }
    }

    const load = validDevice
      ? await summarizeSnmpBdfbLoad(parsed.deviceId, topology, bindings, hub, now.getTime())
      : null;

    const evidence: QdfLiveFeedPowerEvidence[] = [];
    const derivation: string[] = [];
    for (const portId of ports) {
      const active = (await bindings.listForTarget('ACCESS_PORT', portId)).filter(
        (binding) => binding.lifecycle === 'ACTIVE' && binding.protocol === 'SNMP',
      );
      const currents = active.filter((binding) => binding.metric === 'CURRENT');
      const voltages = active.filter((binding) => binding.metric === 'VOLTAGE');
      const current = currents.length === 1 ? currents[0]! : null;
      const voltage = voltages.length === 1 ? voltages[0]! : null;
      const sample = latestSamples.find(
        (candidate) => candidate.protocol === 'SNMP' && candidate.targetId === portId,
      );
      const sameSource = Boolean(
        current &&
        voltage &&
        current.sourceIdentity === voltage.sourceIdentity &&
        sample?.sourceIdentity === current.sourceIdentity,
      );
      evidence.push({
        accessPortId: portId,
        sameSource,
        currentSourceMode: bindingMode(current?.attributes),
        voltageSourceMode: bindingMode(voltage?.attributes),
        currentObservedAt: metricObservedAt(sample?.reported.currentA),
        voltageObservedAt: metricObservedAt(sample?.reported.voltageV),
      });
      if (sameSource && current?.sourcePointId && voltage?.sourcePointId) {
        derivation.push(
          `${current.sourceIdentity}:${current.sourcePointId}`,
          `${voltage.sourceIdentity}:${voltage.sourcePointId}`,
        );
      }
    }

    const total = load ? projectVerifiedLiveTotalPower(load, evidence) : null;
    const quality: Signal['quality'] = total
      ? 'VALID'
      : evidence.some(
            (item) =>
              !item.sameSource ||
              item.currentSourceMode !== 'FIELD' ||
              item.voltageSourceMode !== 'FIELD',
          )
        ? 'INVALID'
        : unavailableQuality(load);
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
      rawValue: total?.powerKw ?? null,
      value: total?.powerKw ?? null,
      unit: 'kW',
      scale: null,
      quality,
      alarmState: null,
      severity: null,
      profileVersion: 'qdf-total-power-v1',
      receivedAt: now.toISOString(),
      observedAt,
      staleMs: 90_000,
      eventId: `qdf-total-power:${parsed.deviceId}:${observedAt}`,
      ...(derivation.length ? { derivedFrom: derivation } : {}),
    });
  }

  return output;
}
