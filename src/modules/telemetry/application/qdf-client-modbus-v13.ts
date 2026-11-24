import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import {
  isBdfbFeedPort,
  summarizeSnmpBdfbLoad,
  type SnmpBdfbFeedView,
} from '@/modules/telemetry/application/snmp-feed-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode } from '@/modules/topology/domain/entities';

export type QdfClientV13Point =
  | 'INPUT_A_RATED_CURRENT'
  | 'INPUT_A_VOLTAGE'
  | 'INPUT_A_CURRENT'
  | 'INPUT_A_POWER'
  | 'INPUT_B_RATED_CURRENT'
  | 'INPUT_B_VOLTAGE'
  | 'INPUT_B_CURRENT'
  | 'INPUT_B_POWER'
  | 'MODBUS_V13_TOTAL_CURRENT'
  | 'MODBUS_V13_BUS_A_VOLTAGE'
  | 'MODBUS_V13_BUS_B_VOLTAGE'
  | 'MODBUS_V13_TOTAL_VOLTAGE'
  | 'MODBUS_V13_TOTAL_POWER'
  | 'MODBUS_V13_TOTAL_ENERGY'
  | 'COMMUNICATION_STATUS'
  | 'CONTROLLER_ALARM_STATE'
  | 'ALARM_SEVERITY';

export interface QdfClientV13PublicationRequest {
  readonly signalId: string;
  readonly logicalPointId: string;
}

const POINTS = new Set<QdfClientV13Point>([
  'INPUT_A_RATED_CURRENT',
  'INPUT_A_VOLTAGE',
  'INPUT_A_CURRENT',
  'INPUT_A_POWER',
  'INPUT_B_RATED_CURRENT',
  'INPUT_B_VOLTAGE',
  'INPUT_B_CURRENT',
  'INPUT_B_POWER',
  'MODBUS_V13_TOTAL_CURRENT',
  'MODBUS_V13_BUS_A_VOLTAGE',
  'MODBUS_V13_BUS_B_VOLTAGE',
  'MODBUS_V13_TOTAL_VOLTAGE',
  'MODBUS_V13_TOTAL_POWER',
  'MODBUS_V13_TOTAL_ENERGY',
  'COMMUNICATION_STATUS',
  'CONTROLLER_ALARM_STATE',
  'ALARM_SEVERITY',
]);

const SEVERITY_CODE = { INFO: 1, WARNING: 2, CRITICAL: 3 } as const;

export function parseQdfClientV13LogicalPoint(
  logicalPointId: string,
): { qdf: string; point: QdfClientV13Point } | null {
  const match = /^QDF\/([^/]{1,160})\/([A-Z][A-Z0-9_]{2,63})$/.exec(logicalPointId);
  if (!match || !POINTS.has(match[2] as QdfClientV13Point)) return null;
  return { qdf: match[1]!, point: match[2]! as QdfClientV13Point };
}

function sideFeed(feeds: readonly SnmpBdfbFeedView[], side: 'A' | 'B'): SnmpBdfbFeedView | null {
  const selected = feeds.filter((feed) => feed.side === side);
  return selected.length === 1 ? selected[0]! : null;
}

function live(feed: SnmpBdfbFeedView | null): boolean {
  return Boolean(feed && (feed.status === 'LIVE' || feed.status === 'LAB_LIVE'));
}

function communicationStatus(load: Awaited<ReturnType<typeof summarizeSnmpBdfbLoad>>): number {
  if (!load) return 3;
  if (
    load.feeds.some((feed) => feed.status === 'CONFLICT' || feed.status === 'UNVERIFIED') ||
    load.configurationIssues.some((issue) => !/^SHUNT_NOT_VERIFIED_/.test(issue))
  )
    return 3;
  if (load.feeds.some((feed) => feed.status === 'STALE')) return 2;
  if (
    load.feeds.length === 0 ||
    load.feeds.some((feed) => feed.status === 'NO_DATA' || feed.status === 'UNMAPPED')
  )
    return 0;
  return load.feeds.every(live) && load.feeds.length === load.expectedFeedCount ? 1 : 3;
}

function requestValue(
  point: QdfClientV13Point,
  feedA: SnmpBdfbFeedView | null,
  feedB: SnmpBdfbFeedView | null,
  communication: number,
  alarmState: number,
  alarmSeverity: number,
): { value: number | null; unit: string; quality: Signal['quality'] } {
  const metric = (
    feed: SnmpBdfbFeedView | null,
    field: 'rated' | 'voltage' | 'current' | 'power',
  ) => {
    if (!feed) return null;
    if (field === 'rated') return feed.ratedCurrentA;
    if (!live(feed)) return null;
    if (field === 'voltage') return feed.voltageV;
    if (field === 'current') return feed.currentA;
    return feed.estimatedPowerW === null ? null : Math.abs(feed.estimatedPowerW) / 1000;
  };

  const byPoint: Partial<Record<QdfClientV13Point, { value: number | null; unit: string }>> = {
    INPUT_A_RATED_CURRENT: { value: metric(feedA, 'rated'), unit: 'A' },
    INPUT_A_VOLTAGE: { value: metric(feedA, 'voltage'), unit: 'V' },
    INPUT_A_CURRENT: { value: metric(feedA, 'current'), unit: 'A' },
    INPUT_A_POWER: { value: metric(feedA, 'power'), unit: 'kW' },
    INPUT_B_RATED_CURRENT: { value: metric(feedB, 'rated'), unit: 'A' },
    INPUT_B_VOLTAGE: { value: metric(feedB, 'voltage'), unit: 'V' },
    INPUT_B_CURRENT: { value: metric(feedB, 'current'), unit: 'A' },
    INPUT_B_POWER: { value: metric(feedB, 'power'), unit: 'kW' },
    MODBUS_V13_TOTAL_CURRENT: {
      value:
        metric(feedA, 'current') !== null && metric(feedB, 'current') !== null
          ? metric(feedA, 'current')! + metric(feedB, 'current')!
          : null,
      unit: 'A',
    },
    MODBUS_V13_BUS_A_VOLTAGE: { value: metric(feedA, 'voltage'), unit: 'V' },
    MODBUS_V13_BUS_B_VOLTAGE: { value: metric(feedB, 'voltage'), unit: 'V' },
    MODBUS_V13_TOTAL_VOLTAGE: {
      value:
        metric(feedA, 'voltage') !== null && metric(feedB, 'voltage') !== null
          ? (metric(feedA, 'voltage')! + metric(feedB, 'voltage')!) / 2
          : null,
      unit: 'V',
    },
    MODBUS_V13_TOTAL_POWER: {
      value:
        metric(feedA, 'power') !== null && metric(feedB, 'power') !== null
          ? metric(feedA, 'power')! + metric(feedB, 'power')!
          : null,
      unit: 'kW',
    },
    MODBUS_V13_TOTAL_ENERGY: { value: null, unit: 'kWh' },
    COMMUNICATION_STATUS: { value: communication, unit: '' },
    CONTROLLER_ALARM_STATE: { value: alarmState, unit: '' },
    ALARM_SEVERITY: { value: alarmSeverity, unit: '' },
  };
  const selected = byPoint[point]!;
  return {
    ...selected,
    quality: selected.value === null ? 'UNOBSERVED' : 'VALID',
  };
}

export async function projectQdfClientV13Signals(
  requests: readonly QdfClientV13PublicationRequest[],
  topology: TopologyRepository,
  bindings: TelemetryBindingRepository,
  history: {
    queryLatestEntities(
      targetIds: readonly string[],
      targetType: TelemetrySample['targetType'],
    ): Promise<readonly TelemetrySample[]>;
  },
  alarms: AlarmRepository,
  now = new Date(),
): Promise<Signal[]> {
  if (!requests.length) return [];
  const activeAlarms = await alarms.listActive();
  const grouped = new Map<string, QdfClientV13PublicationRequest[]>();
  for (const request of requests) {
    const parsed = parseQdfClientV13LogicalPoint(request.logicalPointId);
    if (!parsed) continue;
    grouped.set(parsed.qdf, [...(grouped.get(parsed.qdf) ?? []), request]);
  }

  const devices = (await topology.listByKind('DEVICE')).filter(
    (node): node is DeviceNode =>
      node.kind === 'DEVICE' && node.lifecycle === 'ACTIVE' && node.deviceType === 'BDFB',
  );

  const groups = await Promise.all(
    [...grouped.entries()].map(async ([qdf, deviceRequests]) => {
      const normalized = qdf.trim().toUpperCase();
      const matches = devices.filter((candidate) => {
        const name = candidate.name.trim().toUpperCase();
        const declared =
          typeof candidate.attributes?.qdfIdentity === 'string'
            ? candidate.attributes.qdfIdentity.trim().toUpperCase()
            : null;
        return declared === normalized || name === normalized || name === 'BDFB ' + normalized;
      });
      const device = matches.length === 1 ? matches[0]! : null;
      const validDevice = device !== null;
      const deviceId = device?.id ?? qdf;
      const ports = validDevice
        ? (await topology.listEquipmentForDevice(deviceId))
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
          // The status points fail closed below; do not fabricate controller readings.
        }
      }
      const load = validDevice
        ? await summarizeSnmpBdfbLoad(deviceId, topology, bindings, hub, now.getTime())
        : null;
      const config2 = load?.expectedFeedCount === 2 && load.feeds.length === 2;
      const feedA = config2 ? sideFeed(load.feeds, 'A') : null;
      const feedB = config2 ? sideFeed(load.feeds, 'B') : null;
      const communication = validDevice ? communicationStatus(load) : 3;
      const matchingAlarms = validDevice
        ? activeAlarms.filter(
            (alarm) => alarm.targetId === deviceId && alarm.targetType === 'DEVICE',
          )
        : [];
      const alarmState = matchingAlarms.length ? 1 : 0;
      const alarmSeverity = matchingAlarms.reduce(
        (highest, alarm) => Math.max(highest, SEVERITY_CODE[alarm.severity] ?? 0),
        0,
      );

      return deviceRequests.map((request) => {
        const parsed = parseQdfClientV13LogicalPoint(request.logicalPointId)!;
        const projected = requestValue(
          parsed.point,
          feedA,
          feedB,
          communication,
          alarmState,
          alarmSeverity,
        );
        const observedAt =
          [feedA?.observedAt, feedB?.observedAt]
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1) ?? now.toISOString();
        return {
          id: request.signalId,
          logicalPointId: request.logicalPointId,
          publicationSignalId: request.signalId,
          authoritative: true,
          key: request.logicalPointId,
          sourceIdentity: 'SITE_MAPPER_MODBUS_V13',
          protocol: 'SNMP' as const,
          targetId: deviceId,
          kind: 'measurement' as const,
          mibName: null,
          interpretation: 'PROFILE' as const,
          rawType: projected.value === null ? 'unavailable' : 'derived-number',
          rawValue: projected.value,
          value: projected.value,
          unit: projected.unit,
          scale: null,
          quality: validDevice ? projected.quality : ('INVALID' as const),
          alarmState: null,
          severity: null,
          profileVersion: 'modbus-client-v1.3',
          receivedAt: now.toISOString(),
          observedAt,
          staleMs: 90_000,
          eventId: 'modbus-v1.3:' + deviceId + ':' + parsed.point + ':' + observedAt,
        } satisfies Signal;
      });
    }),
  );
  return groups.flat();
}
