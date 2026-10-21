import {
  assessConfig4Inventory,
  bdfbHardwareProfile,
  CONFIG_4_DEFAULT_OVERLOAD_A,
  config4FeedPosition,
} from '@/modules/power/domain/bdfb-hardware-profile';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryHistoryWriter } from '@/modules/telemetry/application/telemetry-history-writer';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { SnmpFeedPacket } from '@/modules/telemetry/domain/snmp-feed';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { AccessPort, EquipmentNode } from '@/modules/topology/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

export type SnmpFeedIngestError =
  | 'UNKNOWN_SNMP_POINT'
  | 'AMBIGUOUS_SNMP_POINT'
  | 'INVALID_SNMP_FEED_TARGET'
  | 'CONFLICTING_SNMP_FEED'
  | 'OUT_OF_ORDER_SNMP_SAMPLE'
  | 'HISTORY_STORE_UNAVAILABLE';

export function isBdfbFeedPort(port: AccessPort): boolean {
  return (
    port.lifecycle === 'ACTIVE' &&
    port.portType === 'POWER' &&
    port.direction === 'INPUT' &&
    port.exposure === 'EXTERNAL' &&
    port.attributes?.snmpFeedInput === true
  );
}

export interface SnmpFeedInput {
  readonly port: AccessPort;
  readonly owner: EquipmentNode;
  readonly binding: TelemetryBinding;
}

export async function resolveSnmpFeedPort(
  topology: TopologyRepository,
  portId: string,
  deviceId?: string,
): Promise<{ owner: EquipmentNode; port: AccessPort } | null> {
  const owner = await topology.getEquipmentByAccessPortId(portId);
  if (!owner || owner.lifecycle !== 'ACTIVE' || (deviceId && owner.deviceId !== deviceId)) {
    return null;
  }
  const device = await topology.getById(owner.deviceId);
  if (device?.kind !== 'DEVICE' || device.lifecycle !== 'ACTIVE' || device.deviceType !== 'BDFB')
    return null;
  const port = owner.accessPorts.find((p) => p.id === portId);
  if (!port || !isBdfbFeedPort(port)) return null;
  return { owner, port };
}

/**
 * Serialize accepts from the same SNMP controller within this process.
 * Cross-replica atomicity still requires a shared-store uniqueness guarantee.
 */
const sourceIngestLocks = new Map<string, Promise<void>>();

/**
 * Site Mapper is the SNMP observation consumer. The field collector (real or emulated)
 * owns SNMP network access. Only commissioned OID + metric + agent tuples are accepted.
 */
export class SnmpFeedService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly bindings: TelemetryBindingRepository,
    private readonly hub: TelemetryHub,
    private readonly history?: TelemetryHistoryWriter,
  ) {}

  async ingest(
    packet: SnmpFeedPacket,
    receivedAt = new Date().toISOString(),
  ): Promise<Result<readonly TelemetrySample[], SnmpFeedIngestError>> {
    const key = packet.sourceIdentity;
    const prior = sourceIngestLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.then(() => current);
    sourceIngestLocks.set(key, tail);
    await prior;
    try {
      return await this.ingestLocked(packet, receivedAt);
    } finally {
      release();
      if (sourceIngestLocks.get(key) === tail) sourceIngestLocks.delete(key);
    }
  }

  private async ingestLocked(
    packet: SnmpFeedPacket,
    receivedAt: string,
  ): Promise<Result<readonly TelemetrySample[], SnmpFeedIngestError>> {
    const existing = (await this.bindings.listForSource('SNMP', packet.sourceIdentity)).filter(
      (item) => item.lifecycle === 'ACTIVE' && item.targetType === 'ACCESS_PORT',
    );
    const grouped = new Map<
      string,
      { sourceIdentity: string; bindingIds: string[]; values: Record<string, unknown> }
    >();

    // Validate the entire packet before publishing: never accept uncommissioned OIDs
    // or attribute a plant-wide current to an individual BDFB by guesswork.
    for (const observation of packet.measurements) {
      const matches = existing.filter(
        (binding) =>
          binding.sourcePointId === observation.oid && binding.metric === observation.metric,
      );
      if (!matches.length) return failure('UNKNOWN_SNMP_POINT');
      if (matches.length !== 1) return failure('AMBIGUOUS_SNMP_POINT');
      const binding = matches[0]!;
      const target = await resolveSnmpFeedPort(this.topology, binding.targetId);
      if (!target) return failure('INVALID_SNMP_FEED_TARGET');
      const activeForPort = (
        await this.bindings.listForTarget('ACCESS_PORT', target.port.id)
      ).filter(
        (b) => b.lifecycle === 'ACTIVE' && b.protocol === 'SNMP' && b.metric === observation.metric,
      );
      if (activeForPort.length !== 1 || activeForPort[0]!.id !== binding.id)
        return failure('CONFLICTING_SNMP_FEED');

      const item = grouped.get(target.port.id) ?? {
        sourceIdentity: packet.sourceIdentity,
        bindingIds: [],
        values: {},
      };
      item.bindingIds.push(binding.id);
      const field = observation.metric === 'CURRENT' ? 'currentA' : 'voltageV';
      item.values[field] = {
        value: observation.value,
        unit: observation.unit,
        oid: observation.oid,
        observedAt: packet.observedAt,
      };
      grouped.set(target.port.id, item);
    }

    const accepted: TelemetrySample[] = [];
    for (const [portId, item] of grouped) {
      const sample: TelemetrySample = {
        bindingId: `snmp:feed:${packet.sourceIdentity}:${portId}`,
        metricBindingIds: item.bindingIds,
        targetId: portId,
        targetType: 'ACCESS_PORT',
        entityId: portId,
        entityKind: 'ACCESS_PORT',
        sourceIdentity: item.sourceIdentity,
        reported: item.values,
        receivedAt,
        sourceObservedAt: packet.observedAt,
        protocol: 'SNMP',
      };
      accepted.push(sample);
    }
    // The shared Timescale store is authoritative after a process restart. The
    // process-local hub is only a cache and must never be the sole replay check.
    let persisted: readonly TelemetrySample[] = [];
    if (this.history?.queryLatestEntities && accepted.length) {
      try {
        persisted = await this.history.queryLatestEntities(
          accepted.map((sample) => sample.targetId),
          'ACCESS_PORT',
        );
      } catch {
        return failure('HISTORY_STORE_UNAVAILABLE');
      }
    }
    for (const sample of accepted) {
      const priorSamples = [
        this.hub.latest(sample.targetId),
        ...persisted.filter((prior) => prior.targetId === sample.targetId),
      ];
      for (const prior of priorSamples) {
        if (prior?.protocol !== 'SNMP' || prior.sourceIdentity !== packet.sourceIdentity) continue;
        for (const [metric, reading] of Object.entries(sample.reported)) {
          if (!reading || typeof reading !== 'object' || !('oid' in reading)) continue;
          const old = prior.reported[metric];
          if (
            old &&
            typeof old === 'object' &&
            'oid' in old &&
            old.oid === reading.oid &&
            'observedAt' in old &&
            typeof old.observedAt === 'string' &&
            // Equality is a replay too: changing the value cannot replace it.
            Date.parse(old.observedAt) >= Date.parse(packet.observedAt)
          )
            return failure('OUT_OF_ORDER_SNMP_SAMPLE');
        }
      }
    }
    try {
      for (const sample of accepted) {
        if (this.history?.writeDurable) await this.history.writeDurable(sample);
        else await this.history?.write(sample);
      }
    } catch {
      return failure('HISTORY_STORE_UNAVAILABLE');
    }
    for (const sample of accepted) this.hub.publish(sample);
    return success(accepted);
  }
}

export type SnmpFeedReadingStatus =
  'LIVE' | 'STALE' | 'UNMAPPED' | 'NO_DATA' | 'CONFLICT' | 'UNVERIFIED';

export interface SnmpBdfbFeedView {
  readonly accessPortId: string;
  readonly label: string;
  readonly side: string | null;
  readonly feedPosition: string | null;
  readonly overloadThresholdA: number | null;
  readonly overloadWarning: boolean | null;
  readonly ratedCurrentA: number | null;
  readonly status: SnmpFeedReadingStatus;
  readonly currentA: number | null;
  readonly voltageV: number | null;
  readonly observedAt: string | null;
  readonly sourceIdentity: string | null;
  readonly currentOid: string | null;
  readonly utilizationPct: number | null;
  readonly estimatedPowerW: number | null;
  readonly servedPanelIds: readonly string[];
}

export interface SnmpBdfbLoadView {
  readonly deviceId: string;
  readonly hardwareProfile: string | null;
  readonly inventoryStatus: 'COMPLETE' | 'INCOMPLETE' | 'NOT_APPLICABLE';
  readonly expectedFeedCount: number;
  readonly missingFeedPositions: readonly string[];
  readonly configurationIssues: readonly string[];
  readonly status: 'COMPLETE' | 'PARTIAL' | 'UNMAPPED';
  readonly totalCurrentA: number | null;
  readonly measuredCurrentA: number | null;
  readonly totalRatedCurrentA: number | null;
  readonly totalEstimatedPowerW: number | null;
  readonly feedCount: number;
  readonly freshFeedCount: number;
  readonly feeds: readonly SnmpBdfbFeedView[];
}

/** Only independent explicitly mapped INPUT feed ports are added. No breaker-level inference. */
export async function summarizeSnmpBdfbLoad(
  deviceId: string,
  topology: TopologyRepository,
  bindingRepo: TelemetryBindingRepository,
  hub: TelemetryHub,
  nowMs = Date.now(),
  freshnessMs = 90_000,
): Promise<SnmpBdfbLoadView | null> {
  const device = await topology.getById(deviceId);
  if (
    !device ||
    device.kind !== 'DEVICE' ||
    device.deviceType !== 'BDFB' ||
    device.lifecycle !== 'ACTIVE'
  )
    return null;

  const equipment = (await topology.listEquipmentForDevice(deviceId)).filter(
    (node) => node.lifecycle === 'ACTIVE',
  );
  const selectedProfile = bdfbHardwareProfile(device);
  const assessed = selectedProfile ? assessConfig4Inventory(equipment) : null;
  const feedPorts = equipment.flatMap((owner) =>
    owner.accessPorts.filter(isBdfbFeedPort).map((port) => ({ owner, port })),
  );
  const feeds: SnmpBdfbFeedView[] = [];
  for (const { port } of feedPorts) {
    const bindings = (await bindingRepo.listForTarget('ACCESS_PORT', port.id)).filter(
      (binding) =>
        binding.lifecycle === 'ACTIVE' &&
        binding.protocol === 'SNMP' &&
        binding.metric === 'CURRENT' &&
        Boolean(binding.sourcePointId),
    );
    const binding = bindings.length === 1 ? bindings[0]! : undefined;
    const sample = hub.latest(port.id);
    const voltageBindings = (await bindingRepo.listForTarget('ACCESS_PORT', port.id)).filter(
      (b) => b.lifecycle === 'ACTIVE' && b.protocol === 'SNMP' && b.metric === 'VOLTAGE',
    );
    const current = sample?.reported.currentA;
    const voltage = sample?.reported.voltageV;
    const currentValue = metricReading(current);
    const voltageValue = metricReading(voltage);
    const permitted =
      binding &&
      sample?.sourceIdentity === binding.sourceIdentity &&
      currentValue?.oid === binding.sourcePointId;
    const age = currentValue ? nowMs - Date.parse(currentValue.observedAt) : Infinity;
    const fresh = permitted && age >= -60_000 && age <= freshnessMs;
    const verified = port.attributes?.independentInputConfirmed === true;
    const voltageAge = voltageValue ? nowMs - Date.parse(voltageValue.observedAt) : Infinity;
    const alignedVoltage = Boolean(
      voltageBindings.length === 1 &&
      sample?.sourceIdentity === voltageBindings[0]?.sourceIdentity &&
      voltageValue?.oid === voltageBindings[0]?.sourcePointId &&
      voltageAge >= -60_000 &&
      voltageAge <= freshnessMs &&
      currentValue &&
      voltageValue &&
      Math.abs(Date.parse(currentValue.observedAt) - Date.parse(voltageValue.observedAt)) <=
        freshnessMs,
    );
    const status: SnmpFeedReadingStatus = !verified
      ? 'UNVERIFIED'
      : bindings.length > 1
        ? 'CONFLICT'
        : !binding
          ? 'UNMAPPED'
          : !permitted
            ? 'NO_DATA'
            : fresh
              ? 'LIVE'
              : 'STALE';
    const slot = config4FeedPosition(port);
    const threshold =
      typeof port.attributes?.overloadThresholdA === 'number' &&
      Number.isFinite(port.attributes.overloadThresholdA) &&
      port.attributes.overloadThresholdA > 0
        ? port.attributes.overloadThresholdA
        : selectedProfile
          ? CONFIG_4_DEFAULT_OVERLOAD_A
          : null;
    const nominal = port.attributes?.ratedCurrentA;
    const rating = typeof nominal === 'number' && nominal > 0 ? nominal : null;
    const displayedCurrent = status === 'LIVE' ? currentValue!.value : null;
    const displayedVoltage = status === 'LIVE' && alignedVoltage ? voltageValue!.value : null;
    feeds.push({
      accessPortId: port.id,
      label: port.name,
      side:
        port.attributes?.feed === 'A' || port.attributes?.feed === 'B'
          ? port.attributes.feed
          : null,
      ratedCurrentA: rating,
      feedPosition: slot,
      overloadThresholdA: threshold,
      overloadWarning:
        status === 'LIVE' && threshold !== null ? currentValue!.value >= threshold : null,
      status,
      currentA: displayedCurrent,
      voltageV: displayedVoltage,
      observedAt: permitted && currentValue ? currentValue.observedAt : null,
      sourceIdentity: binding?.sourceIdentity ?? null,
      currentOid: binding?.sourcePointId ?? null,
      utilizationPct:
        rating && displayedCurrent !== null ? (displayedCurrent / rating) * 100 : null,
      estimatedPowerW:
        displayedCurrent !== null && displayedVoltage !== null
          ? displayedCurrent * Math.abs(displayedVoltage)
          : null,
      servedPanelIds: Array.isArray(port.attributes?.servedPanelIds)
        ? port.attributes.servedPanelIds.filter((v): v is string => typeof v === 'string')
        : [],
    });
  }
  const positions = ['A2', 'B2', 'A1', 'B1'];
  feeds.sort((a, b) => {
    if (selectedProfile) {
      const left = positions.indexOf(a.feedPosition ?? '');
      const right = positions.indexOf(b.feedPosition ?? '');
      if (left !== right) return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
    }
    return a.label.localeCompare(b.label);
  });
  const live = feeds.filter((item) => item.status === 'LIVE');
  const measuredCurrentA = live.length ? live.reduce((sum, item) => sum + item.currentA!, 0) : null;
  const inventoryComplete = assessed ? assessed.inventoryComplete : true;
  const complete = inventoryComplete && feeds.length > 0 && live.length === feeds.length;
  const capacityComplete = complete && live.every((feed) => feed.ratedCurrentA !== null);
  const powerComplete = complete && live.every((feed) => feed.estimatedPowerW !== null);
  return {
    deviceId,
    hardwareProfile: selectedProfile,
    inventoryStatus: assessed
      ? assessed.inventoryComplete
        ? 'COMPLETE'
        : 'INCOMPLETE'
      : 'NOT_APPLICABLE',
    expectedFeedCount: assessed?.expectedFeedCount ?? feedPorts.length,
    missingFeedPositions: assessed?.missingFeedPositions ?? [],
    configurationIssues: assessed?.issues ?? [],
    status: complete
      ? 'COMPLETE'
      : feeds.every((item) => item.status === 'UNMAPPED')
        ? 'UNMAPPED'
        : 'PARTIAL',
    totalCurrentA: complete ? measuredCurrentA : null,
    measuredCurrentA,
    totalRatedCurrentA: capacityComplete
      ? live.reduce((sum, feed) => sum + feed.ratedCurrentA!, 0)
      : null,
    totalEstimatedPowerW: powerComplete
      ? live.reduce((sum, feed) => sum + feed.estimatedPowerW!, 0)
      : null,
    feedCount: feeds.length,
    freshFeedCount: live.length,
    feeds,
  };
}

function metricReading(
  candidate: unknown,
): { value: number; oid: string; observedAt: string } | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  if (
    typeof record.value !== 'number' ||
    !Number.isFinite(record.value) ||
    typeof record.oid !== 'string' ||
    typeof record.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.observedAt))
  )
    return null;
  return { value: record.value, oid: record.oid, observedAt: record.observedAt };
}
