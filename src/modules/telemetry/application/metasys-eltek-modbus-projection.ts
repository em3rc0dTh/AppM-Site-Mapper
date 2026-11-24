import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type { AlarmSeverity } from '@/modules/alarm/domain/entities';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import {
  isBdfbFeedPort,
  summarizeSnmpBdfbLoad,
  type SnmpBdfbFeedView,
  type SnmpBdfbLoadView,
} from '@/modules/telemetry/application/snmp-feed-service';
import {
  projectOperationalLiveTotalCurrent,
  projectOperationalLiveTotalPower,
  projectOperationalQdfVoltage,
} from '@/modules/telemetry/application/qdf-operational-projection';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { SnmpFeedTotalEnergy } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';

export const METASYS_ELTEK_POINTS = [
  'INPUT_A_RATED_CURRENT',
  'INPUT_A_VOLTAGE',
  'INPUT_A_CURRENT',
  'INPUT_A_POWER',
  'INPUT_B_RATED_CURRENT',
  'INPUT_B_VOLTAGE',
  'INPUT_B_CURRENT',
  'INPUT_B_POWER',
  'TOTAL_CURRENT',
  'BUS_A_VOLTAGE',
  'BUS_B_VOLTAGE',
  'TOTAL_VOLTAGE',
  'TOTAL_POWER',
  'TOTAL_ENERGY',
  'COMMUNICATION_STATUS',
  'CONTROLLER_ALARM_STATE',
  'ALARM_SEVERITY',
] as const;

export type MetasysEltekPoint = (typeof METASYS_ELTEK_POINTS)[number];

export interface MetasysEltekPublicationRequest {
  readonly signalId: string;
  readonly logicalPointId: string;
}

export interface MetasysEltekHistory {
  queryLatestEntities(
    targetIds: readonly string[],
    targetType: TelemetrySample['targetType'],
  ): Promise<readonly TelemetrySample[]>;
  querySnmpFeedTotalEnergy(targetId: string, sourceIdentity: string): Promise<SnmpFeedTotalEnergy>;
}

const POINTS = new Set<string>(METASYS_ELTEK_POINTS);
const SEVERITY_CODE: Readonly<Record<AlarmSeverity, number>> = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export function parseMetasysEltekLogicalPoint(
  logicalPointId: string,
): { qdfRef: string; point: MetasysEltekPoint } | null {
  const match = /^QDF\/([^/]{1,160})\/([A-Z][A-Z0-9_]{1,63})$/.exec(logicalPointId);
  if (!match || !POINTS.has(match[2]!)) return null;
  return { qdfRef: match[1]!, point: match[2]! as MetasysEltekPoint };
}

async function resolveQdf(
  qdfRef: string,
  topology: TopologyRepository,
): Promise<DeviceNode | null> {
  const direct = await topology.getById(qdfRef);
  if (direct?.kind === 'DEVICE' && direct.lifecycle === 'ACTIVE' && direct.deviceType === 'BDFB')
    return direct;

  const normalized = qdfRef.toUpperCase().replace(/^BDFB\s+/, '');
  const matches = (await topology.listByKind('DEVICE')).filter(
    (node): node is DeviceNode =>
      node.kind === 'DEVICE' &&
      node.lifecycle === 'ACTIVE' &&
      node.deviceType === 'BDFB' &&
      [node.name.toUpperCase(), node.name.toUpperCase().replace(/^BDFB\s+/, '')].includes(
        normalized,
      ),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function unavailableQuality(load: SnmpBdfbLoadView | null): Signal['quality'] {
  if (!load) return 'INVALID';
  if (load.feeds.some((feed) => feed.status === 'CONFLICT')) return 'INVALID';
  if (load.feeds.some((feed) => feed.status === 'STALE')) return 'STALE';
  if (load.feeds.some((feed) => feed.status === 'NO_DATA')) return 'UNOBSERVED';
  if (load.feeds.some((feed) => ['UNMAPPED', 'UNVERIFIED'].includes(feed.status))) return 'INVALID';
  return 'UNKNOWN';
}

function liveFeed(feed: SnmpBdfbFeedView | null): feed is SnmpBdfbFeedView {
  return Boolean(feed && (feed.status === 'LIVE' || feed.status === 'LAB_LIVE'));
}

function communicationCode(load: SnmpBdfbLoadView | null): number {
  const feeds = load?.feeds ?? [];
  if (!feeds.length) return 0;
  const statuses = new Set(feeds.map((feed) => feed.status));
  if (statuses.has('CONFLICT')) return 3;
  const live = feeds.filter((feed) => feed.status === 'LIVE' || feed.status === 'LAB_LIVE').length;
  if (live === feeds.length) return 1;
  if (live > 0 || statuses.has('STALE')) return 2;
  return 0;
}

function measurementSignal(input: {
  request: MetasysEltekPublicationRequest;
  device: DeviceNode;
  value: number | null;
  unit: 'A' | 'V' | 'kW' | 'kWh';
  quality: Signal['quality'];
  observedAt: string;
  now: string;
  rawType?: string;
  derivedFrom?: readonly string[];
}): Signal {
  return {
    id: input.request.signalId,
    logicalPointId: input.request.logicalPointId,
    publicationSignalId: input.request.signalId,
    authoritative: true,
    key: input.request.logicalPointId,
    sourceIdentity: 'SITE_MAPPER_METASYS_ELTEK',
    protocol: 'SNMP',
    targetId: input.device.id,
    kind: 'measurement',
    mibName: null,
    interpretation: 'PROFILE',
    ...(input.derivedFrom?.length ? { derivedFrom: input.derivedFrom } : {}),
    rawType: input.rawType ?? 'derived-number',
    rawValue: input.value,
    value: input.value,
    unit: input.unit,
    scale: null,
    quality: input.quality,
    alarmState: null,
    severity: null,
    profileVersion: 'metasys-eltek-v1.3',
    receivedAt: input.now,
    observedAt: input.observedAt,
    staleMs: 90_000,
    eventId: `metasys-eltek:${input.device.id}:${input.request.logicalPointId}:${input.observedAt}`,
  };
}

function stateSignal(input: {
  request: MetasysEltekPublicationRequest;
  device: DeviceNode;
  targetId: string;
  value: number;
  now: string;
  alarmState?: 'ACTIVE' | 'RESOLVED';
  severity?: AlarmSeverity | null;
}): Signal {
  return {
    id: input.request.signalId,
    logicalPointId: input.request.logicalPointId,
    publicationSignalId: input.request.signalId,
    authoritative: true,
    key: input.request.logicalPointId,
    sourceIdentity: input.request.logicalPointId.endsWith('/COMMUNICATION_STATUS')
      ? 'SITE_MAPPER_SNMP_HEALTH'
      : 'ALARM_ENGINE',
    protocol: input.request.logicalPointId.endsWith('/COMMUNICATION_STATUS') ? 'SNMP' : 'ALARM',
    targetId: input.targetId,
    kind: input.alarmState ? 'alarm' : 'state',
    mibName: null,
    interpretation: 'PROFILE',
    rawType: 'float32-enum',
    rawValue: input.value,
    value: input.value,
    unit: '',
    scale: null,
    quality: 'VALID',
    alarmState: input.alarmState ?? null,
    severity: input.severity ?? null,
    profileVersion: 'metasys-eltek-v1.3',
    receivedAt: input.now,
    observedAt: input.now,
    staleMs: 10_000,
    eventId: `metasys-eltek-status:${input.device.id}:${input.request.logicalPointId}`,
  };
}

async function feedEnergy(
  feed: SnmpBdfbFeedView,
  history: MetasysEltekHistory,
): Promise<SnmpFeedTotalEnergy | null> {
  if (!feed.sourceIdentity) return null;
  try {
    return await history.querySnmpFeedTotalEnergy(feed.accessPortId, feed.sourceIdentity);
  } catch {
    return null;
  }
}

export async function projectMetasysEltekSignals(
  requests: readonly MetasysEltekPublicationRequest[],
  topology: TopologyRepository,
  bindings: TelemetryBindingRepository,
  history: MetasysEltekHistory,
  alarms: AlarmRepository,
  now = new Date(),
): Promise<Signal[]> {
  if (!requests.length) return [];
  const nowIso = now.toISOString();
  const grouped = new Map<string, MetasysEltekPublicationRequest[]>();
  for (const request of requests) {
    const parsed = parseMetasysEltekLogicalPoint(request.logicalPointId);
    if (!parsed) continue;
    grouped.set(parsed.qdfRef, [...(grouped.get(parsed.qdfRef) ?? []), request]);
  }

  const activeAlarms = await alarms.listActive();
  const output: Signal[] = [];

  for (const [qdfRef, qdfRequests] of grouped) {
    const device = await resolveQdf(qdfRef, topology);
    if (!device) continue;

    const equipment = (await topology.listEquipmentForDevice(device.id)).filter(
      (node) => node.lifecycle === 'ACTIVE',
    );
    const feedPorts = equipment.flatMap((node) =>
      node.accessPorts.filter(isBdfbFeedPort).map((port) => port.id),
    );
    const hub = new TelemetryHub(Math.max(feedPorts.length, 1));
    if (feedPorts.length) {
      try {
        for (const sample of await history.queryLatestEntities(feedPorts, 'ACCESS_PORT')) {
          if (sample.protocol === 'SNMP' && feedPorts.includes(sample.targetId))
            hub.publish(sample);
        }
      } catch {
        // Projection fails individual values closed below; status still exposes OFFLINE/ERROR semantics.
      }
    }

    const load = await summarizeSnmpBdfbLoad(device.id, topology, bindings, hub, now.getTime());
    const sideA = load?.feeds.filter((feed) => feed.side === 'A') ?? [];
    const sideB = load?.feeds.filter((feed) => feed.side === 'B') ?? [];
    const feedA = sideA.length === 1 ? sideA[0]! : null;
    const feedB = sideB.length === 1 ? sideB[0]! : null;
    const fallbackQuality = unavailableQuality(load);
    const totalCurrent = load ? projectOperationalLiveTotalCurrent(load) : null;
    const totalPower = load ? projectOperationalLiveTotalPower(load) : null;
    const voltage = load
      ? projectOperationalQdfVoltage(
          load.feeds.map((feed) => ({
            accessPortId: feed.accessPortId,
            side: feed.side === 'A' || feed.side === 'B' ? feed.side : null,
            position: feed.feedPosition ?? feed.side,
            verified: feed.status === 'LIVE',
            sourceMode: feed.status === 'LAB_LIVE' ? 'SYNTHETIC_LAB_ONLY' : 'FIELD',
            voltageV: liveFeed(feed) ? feed.voltageV : null,
            observedAt: liveFeed(feed) ? feed.observedAt : null,
          })),
          load.expectedFeedCount,
        )
      : { busA: null, busB: null, total: null };
    const totalCurrentA = totalCurrent?.currentA ?? null;
    const totalPowerKw = totalPower?.powerKw ?? null;
    const busAV = voltage.busA?.voltageV ?? null;
    const busBV = voltage.busB?.voltageV ?? null;
    const totalVoltageV = voltage.total?.voltageV ?? null;

    let totalEnergyKwh: number | null = null;
    if (feedA && feedB) {
      const [energyA, energyB] = await Promise.all([
        feedEnergy(feedA, history),
        feedEnergy(feedB, history),
      ]);
      if (
        energyA?.estimatedEnergyKwh !== null &&
        energyA?.estimatedEnergyKwh !== undefined &&
        energyB?.estimatedEnergyKwh !== null &&
        energyB?.estimatedEnergyKwh !== undefined
      ) {
        totalEnergyKwh = energyA.estimatedEnergyKwh + energyB.estimatedEnergyKwh;
      }
    }

    const controllers = equipment.filter(
      (node): node is EquipmentNode => node.equipmentType === 'CONTROLLER_BOARD',
    );
    const controller = controllers.length === 1 ? controllers[0]! : null;
    const controllerAlarms = controller
      ? activeAlarms.filter(
          (alarm) => alarm.targetType === 'EQUIPMENT' && alarm.targetId === controller.id,
        )
      : [];
    const highestSeverity = controllerAlarms.reduce<AlarmSeverity | null>((highest, alarm) => {
      if (!highest || SEVERITY_CODE[alarm.severity] > SEVERITY_CODE[highest]) return alarm.severity;
      return highest;
    }, null);

    for (const request of qdfRequests) {
      const point = parseMetasysEltekLogicalPoint(request.logicalPointId)!.point;
      const feed = point.startsWith('INPUT_A_')
        ? feedA
        : point.startsWith('INPUT_B_')
          ? feedB
          : null;
      const feedIsLive = liveFeed(feed);
      const observedAt = feed?.observedAt ?? nowIso;
      const quality: Signal['quality'] = feedIsLive ? 'VALID' : fallbackQuality;

      if (point === 'INPUT_A_RATED_CURRENT' || point === 'INPUT_B_RATED_CURRENT') {
        const value =
          feed && typeof feed.ratedCurrentA === 'number' && Number.isFinite(feed.ratedCurrentA)
            ? feed.ratedCurrentA
            : null;
        output.push(
          measurementSignal({
            request,
            device,
            value,
            unit: 'A',
            quality: value !== null ? 'VALID' : 'INVALID',
            observedAt: nowIso,
            now: nowIso,
            rawType: 'configured-number',
          }),
        );
      } else if (point === 'INPUT_A_VOLTAGE' || point === 'INPUT_B_VOLTAGE') {
        output.push(
          measurementSignal({
            request,
            device,
            value: feedIsLive ? feed.voltageV : null,
            unit: 'V',
            quality: feedIsLive && feed.voltageV !== null ? 'VALID' : quality,
            observedAt,
            now: nowIso,
          }),
        );
      } else if (point === 'INPUT_A_CURRENT' || point === 'INPUT_B_CURRENT') {
        output.push(
          measurementSignal({
            request,
            device,
            value: feedIsLive ? feed.currentA : null,
            unit: 'A',
            quality: feedIsLive && feed.currentA !== null ? 'VALID' : quality,
            observedAt,
            now: nowIso,
          }),
        );
      } else if (point === 'INPUT_A_POWER' || point === 'INPUT_B_POWER') {
        const value =
          feedIsLive && feed.estimatedPowerW !== null ? feed.estimatedPowerW / 1000 : null;
        output.push(
          measurementSignal({
            request,
            device,
            value,
            unit: 'kW',
            quality: value !== null ? 'VALID' : quality,
            observedAt,
            now: nowIso,
          }),
        );
      } else if (point === 'TOTAL_CURRENT') {
        output.push(
          measurementSignal({
            request,
            device,
            value: totalCurrentA,
            unit: 'A',
            quality: totalCurrentA !== null ? 'VALID' : fallbackQuality,
            observedAt: totalCurrent?.observedAt ?? nowIso,
            now: nowIso,
          }),
        );
      } else if (point === 'BUS_A_VOLTAGE' || point === 'BUS_B_VOLTAGE') {
        const selected = point === 'BUS_A_VOLTAGE' ? voltage.busA : voltage.busB;
        const value = point === 'BUS_A_VOLTAGE' ? busAV : busBV;
        output.push(
          measurementSignal({
            request,
            device,
            value,
            unit: 'V',
            quality: value !== null ? 'VALID' : fallbackQuality,
            observedAt: selected?.observedAt ?? nowIso,
            now: nowIso,
          }),
        );
      } else if (point === 'TOTAL_VOLTAGE') {
        output.push(
          measurementSignal({
            request,
            device,
            value: totalVoltageV,
            unit: 'V',
            quality: totalVoltageV !== null ? 'VALID' : 'INVALID',
            observedAt: voltage.total?.observedAt ?? nowIso,
            now: nowIso,
          }),
        );
      } else if (point === 'TOTAL_POWER') {
        output.push(
          measurementSignal({
            request,
            device,
            value: totalPowerKw,
            unit: 'kW',
            quality: totalPowerKw !== null ? 'VALID' : fallbackQuality,
            observedAt: totalPower?.observedAt ?? nowIso,
            now: nowIso,
          }),
        );
      } else if (point === 'TOTAL_ENERGY') {
        output.push(
          measurementSignal({
            request,
            device,
            value: totalEnergyKwh,
            unit: 'kWh',
            quality: totalEnergyKwh !== null ? 'VALID' : 'UNOBSERVED',
            // This is a durable Site Mapper cumulative projection. Communication freshness is
            // published independently at COMMUNICATION_STATUS.
            observedAt: nowIso,
            now: nowIso,
            rawType: 'derived-durable-counter',
          }),
        );
      } else if (point === 'COMMUNICATION_STATUS') {
        output.push(
          stateSignal({
            request,
            device,
            targetId: device.id,
            value: communicationCode(load),
            now: nowIso,
          }),
        );
      } else if (point === 'CONTROLLER_ALARM_STATE') {
        if (!controller) continue;
        output.push(
          stateSignal({
            request,
            device,
            targetId: controller.id,
            value: controllerAlarms.length ? 1 : 0,
            now: nowIso,
            alarmState: controllerAlarms.length ? 'ACTIVE' : 'RESOLVED',
            severity: highestSeverity,
          }),
        );
      } else if (point === 'ALARM_SEVERITY') {
        if (!controller) continue;
        output.push(
          stateSignal({
            request,
            device,
            targetId: controller.id,
            value: highestSeverity ? SEVERITY_CODE[highestSeverity] : 0,
            now: nowIso,
            severity: highestSeverity,
          }),
        );
      }
    }
  }

  return output;
}
