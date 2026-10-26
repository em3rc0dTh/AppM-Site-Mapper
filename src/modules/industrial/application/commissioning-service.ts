import { randomUUID } from 'node:crypto';

import type { CommunicationProfileRepository } from '@/modules/industrial/infrastructure/communication-profile-repository';
import type {
  CommunicationProfile, CommunicationProfileInput, ConfirmChannelInput,
  RetireChannelInput,
} from '@/modules/industrial/domain/commissioning';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';

const mark = 'ACREL_VERIFIED_CHANNEL' as const;
const allMetrics = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const;

export type CommissioningError =
  | 'BDFB_NOT_FOUND' | 'EQUIPMENT_NOT_FOUND' | 'INVALID_ROLE' |
    'GATEWAY_NOT_COMMISSIONED' | 'COMMUNICATION_MISMATCH' |
    'PROFILE_IN_USE' | 'REVISION_CONFLICT' | 'REVISION_LIMIT' |
    'BREAKER_NOT_FOUND' | 'CROSS_BDFB_MAPPING' | 'CHANNEL_CONFLICT' |
    'SOURCE_POINT_CONFLICT' | 'BREAKER_BINDING_CONFLICT' |
    'BINDING_CONFLICT' | 'ATOMIC_BINDINGS_REQUIRED' | 'MAPPING_NOT_FOUND';

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CommissioningError };

const good = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = <T>(error: CommissioningError): Result<T> => ({ ok: false, error });

function relevantBindings(list: readonly TelemetryBinding[]): TelemetryBinding[] {
  return list.filter((binding) =>
    binding.lifecycle === 'ACTIVE' && binding.protocol === 'MQTT' &&
    allMetrics.includes(binding.metric as (typeof allMetrics)[number]));
}

function previouslyConfirmed(binding: TelemetryBinding): boolean {
  return binding.attributes?.commissioning === mark;
}

function profileSnapshot(profile: CommunicationProfile): CommunicationProfileInput {
  const snapshot = structuredClone(profile) as unknown as Record<string, unknown>;
  delete snapshot.bdfbDeviceId;
  delete snapshot.revisionNumber;
  delete snapshot.createdAt;
  delete snapshot.updatedAt;
  delete snapshot.updatedBy;
  delete snapshot.history;
  return snapshot as unknown as CommunicationProfileInput;
}

export class IndustrialCommissioningService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly profiles: CommunicationProfileRepository,
    private readonly bindings: TelemetryBindingRepository,
  ) {}

  async bdfbInventory(deviceId: string) {
    const device = await this.topology.getById(deviceId);
    if (device?.kind !== 'DEVICE' || device.deviceType !== 'BDFB' ||
        device.lifecycle !== 'ACTIVE') return null;
    const equipment = (await this.topology.listEquipmentForDevice(deviceId))
      .filter((item) => item.lifecycle === 'ACTIVE');
    return { device, equipment };
  }

  async listBdfbs(): Promise<readonly DeviceNode[]> {
    return (await this.topology.listByKind('DEVICE')).filter(
      (node): node is DeviceNode =>
        node.kind === 'DEVICE' && node.deviceType === 'BDFB' && node.lifecycle === 'ACTIVE',
    );
  }

  async overview(deviceId: string): Promise<Result<{
    device: DeviceNode;
    equipment: readonly EquipmentNode[];
    profiles: readonly CommunicationProfile[];
    mappings: readonly {
      breakerId: string;
      sourceIdentity: string;
      rawPointId: string;
      meterEquipmentId: string;
      gatewayEquipmentId: string;
      channel: number;
      metrics: readonly string[];
      confirmedBy: string;
      confirmedAt: string;
      evidence: unknown;
    }[];
  }>> {
    const inventory = await this.bdfbInventory(deviceId);
    if (!inventory) return bad('BDFB_NOT_FOUND');
    const equipment = inventory.equipment;
    const breakers = equipment.filter((item) => item.equipmentType === 'CIRCUIT_BREAKER');
    const bindingList = await this.bindings.listForTargets(
      'EQUIPMENT', breakers.map((breaker) => breaker.id),
    );
    const grouped = new Map<string, {
      breakerId: string; sourceIdentity: string; rawPointId: string;
      meterEquipmentId: string; gatewayEquipmentId: string; channel: number;
      metrics: string[]; confirmedBy: string; confirmedAt: string; evidence: unknown;
    }>();
    for (const binding of bindingList) {
      if (!previouslyConfirmed(binding) || !binding.sourcePointId) continue;
      const attrs = binding.attributes!;
      if (
        typeof attrs.meterEquipmentId !== 'string' ||
        typeof attrs.gatewayEquipmentId !== 'string' ||
        typeof attrs.channel !== 'number' ||
        typeof attrs.confirmedBy !== 'string' ||
        typeof attrs.confirmedAt !== 'string'
      ) continue;
      const key = [binding.targetId, binding.sourceIdentity, binding.sourcePointId].join('\u0000');
      let group = grouped.get(key);
      if (!group) {
        group = {
          breakerId: binding.targetId, sourceIdentity: binding.sourceIdentity,
          rawPointId: binding.sourcePointId, meterEquipmentId: attrs.meterEquipmentId,
          gatewayEquipmentId: attrs.gatewayEquipmentId, channel: attrs.channel,
          metrics: [], confirmedBy: attrs.confirmedBy, confirmedAt: attrs.confirmedAt,
          evidence: attrs.evidence,
        };
        grouped.set(key, group);
      }
      group.metrics.push(binding.metric);
    }
    return good({
      device: inventory.device, equipment,
      profiles: await this.profiles.listByBdfb(deviceId),
      mappings: [...grouped.values()],
    });
  }

  async saveProfile(
    input: CommunicationProfileInput,
    actorId: string,
    expectedRevision: number | null,
  ): Promise<Result<CommunicationProfile>> {
    const equipment = await this.topology.getById(input.equipmentId);
    if (!equipment || equipment.kind !== 'EQUIPMENT' || equipment.lifecycle !== 'ACTIVE')
      return bad('EQUIPMENT_NOT_FOUND');
    const inventory = await this.bdfbInventory(equipment.deviceId);
    if (!inventory) return bad('BDFB_NOT_FOUND');
    if (equipment.equipmentType === 'CIRCUIT_BREAKER' || equipment.equipmentType === 'PANEL')
      return bad('INVALID_ROLE');

    if (input.role === 'METER') {
      const gateway = await this.topology.getById(input.gatewayEquipmentId!);
      if (gateway?.kind !== 'EQUIPMENT' || gateway.lifecycle !== 'ACTIVE' ||
          gateway.deviceId !== equipment.deviceId) return bad('CROSS_BDFB_MAPPING');
      const gatewayProfile = await this.profiles.get(gateway.id);
      if (!gatewayProfile || gatewayProfile.role !== 'GATEWAY')
        return bad('GATEWAY_NOT_COMMISSIONED');
      const bus = gatewayProfile.rs485;
      if (bus.baudRate !== input.rs485.baudRate ||
          bus.dataBits !== input.rs485.dataBits ||
          bus.parity !== input.rs485.parity || bus.stopBits !== input.rs485.stopBits)
        return bad('COMMUNICATION_MISMATCH');
    }

    const existing = await this.profiles.get(input.equipmentId);
    if ((existing?.revisionNumber ?? null) !== expectedRevision) return bad('REVISION_CONFLICT');
    if (existing?.history.length && existing.history.length >= 100)
      return bad('REVISION_LIMIT');
    if (existing && (existing.bdfbDeviceId !== equipment.deviceId || existing.role !== input.role))
      return bad('INVALID_ROLE');

    // A bound channel must be retired before moving its meter to a different
    // gateway/slave or changing the publisher identity. Network IP changes do not
    // erase existing bindings and are recorded as a revision.
    if (existing?.role === 'GATEWAY') {
      if (existing.sourceIdentity && existing.sourceIdentity !== input.sourceIdentity) {
        const mapped = await this.bindings.listForSource('MQTT', existing.sourceIdentity);
        if (mapped.some(previouslyConfirmed)) return bad('PROFILE_IN_USE');
      }
      const busChanged =
        existing.rs485.baudRate !== input.rs485.baudRate ||
        existing.rs485.dataBits !== input.rs485.dataBits ||
        existing.rs485.parity !== input.rs485.parity ||
        existing.rs485.stopBits !== input.rs485.stopBits;
      if (busChanged) {
        const profiles = await this.profiles.listByBdfb(equipment.deviceId);
        if (profiles.some((profile) =>
          profile.role === 'METER' && profile.gatewayEquipmentId === existing.equipmentId))
          return bad('PROFILE_IN_USE');
      }
    }
    if (existing?.role === 'METER' &&
        (existing.gatewayEquipmentId !== input.gatewayEquipmentId ||
         existing.rs485.slaveId !== input.rs485.slaveId)) {
      const siblings = await this.topology.listEquipmentForDevice(equipment.deviceId);
      const breakers = siblings.filter((node) => node.equipmentType === 'CIRCUIT_BREAKER');
      const mapped = await this.bindings.listForTargets('EQUIPMENT', breakers.map((node) => node.id));
      if (mapped.some((binding) =>
        previouslyConfirmed(binding) && binding.attributes?.meterEquipmentId === input.equipmentId))
        return bad('PROFILE_IN_USE');
    }
    const timestamp = new Date().toISOString();
    const next: CommunicationProfile = {
      ...input,
      bdfbDeviceId: equipment.deviceId,
      revisionNumber: (existing?.revisionNumber ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      updatedBy: actorId,
      history: existing
        ? [...existing.history, {
            revisionNumber: existing.revisionNumber, updatedAt: existing.updatedAt,
            updatedBy: existing.updatedBy, snapshot: profileSnapshot(existing),
          }]
        : [],
    };
    return (await this.profiles.save(next, expectedRevision))
      ? good(next) : bad('REVISION_CONFLICT');
  }

  async confirmChannel(input: ConfirmChannelInput, actorId: string):
    Promise<Result<{ readonly breakerId: string; readonly created: readonly string[] }>> {
    const meter = await this.profiles.get(input.meterEquipmentId);
    if (!meter || meter.role !== 'METER' || !meter.gatewayEquipmentId)
      return bad('EQUIPMENT_NOT_FOUND');
    if (input.channel > (meter.channelCount ?? 24)) return bad('CHANNEL_CONFLICT');
    const gateway = await this.profiles.get(meter.gatewayEquipmentId);
    if (!gateway || gateway.role !== 'GATEWAY' || !gateway.sourceIdentity)
      return bad('GATEWAY_NOT_COMMISSIONED');

    const [meterNode, gatewayNode, breaker] = await Promise.all([
      this.topology.getById(meter.equipmentId),
      this.topology.getById(gateway.equipmentId),
      this.topology.getById(input.breakerId),
    ]);
    if (
      meterNode?.kind !== 'EQUIPMENT' || meterNode.lifecycle !== 'ACTIVE' ||
      gatewayNode?.kind !== 'EQUIPMENT' || gatewayNode.lifecycle !== 'ACTIVE' ||
      breaker?.kind !== 'EQUIPMENT' || breaker.lifecycle !== 'ACTIVE' ||
      breaker.equipmentType !== 'CIRCUIT_BREAKER'
    ) return bad('BREAKER_NOT_FOUND');
    if (
      meterNode.deviceId !== breaker.deviceId || gatewayNode.deviceId !== breaker.deviceId ||
      gateway.bdfbDeviceId !== breaker.deviceId || meter.bdfbDeviceId !== breaker.deviceId ||
      !(await this.bdfbInventory(breaker.deviceId))
    ) return bad('CROSS_BDFB_MAPPING');

    if (!this.bindings.insertBatch) return bad('ATOMIC_BINDINGS_REQUIRED');
    const [allSource, allBreaker] = await Promise.all([
      this.bindings.listForSource('MQTT', gateway.sourceIdentity),
      this.bindings.listForTarget('EQUIPMENT', input.breakerId),
    ]);
    const point = allSource.filter((binding) =>
      binding.lifecycle === 'ACTIVE' && binding.sourcePointId === input.rawPointId);
    if (point.some((binding) => binding.targetType !== 'EQUIPMENT' ||
      binding.targetId !== input.breakerId)) return bad('SOURCE_POINT_CONFLICT');
    if (allSource.some((binding) => previouslyConfirmed(binding) &&
      binding.attributes?.meterEquipmentId === input.meterEquipmentId &&
      binding.attributes?.channel === input.channel &&
      binding.sourcePointId !== input.rawPointId)) return bad('CHANNEL_CONFLICT');
    if (relevantBindings(allBreaker).some((binding) =>
      binding.sourceIdentity !== gateway.sourceIdentity ||
      binding.sourcePointId !== input.rawPointId)) return bad('BREAKER_BINDING_CONFLICT');
    if (allBreaker.some((binding) => binding.lifecycle === 'ACTIVE' &&
      binding.metric.toUpperCase() === 'SOURCE')) return bad('BREAKER_BINDING_CONFLICT');

    if (point.length) {
      const same = point.every((binding) =>
        previouslyConfirmed(binding) &&
        binding.attributes?.meterEquipmentId === input.meterEquipmentId &&
        binding.attributes?.gatewayEquipmentId === gateway.equipmentId &&
        binding.attributes?.channel === input.channel &&
        input.metrics.includes(binding.metric as (typeof input.metrics)[number]));
      if (!same || point.length !== input.metrics.length) return bad('BINDING_CONFLICT');
      return good({ breakerId: input.breakerId, created: [] });
    }

    const now = new Date().toISOString();
    const bindings: TelemetryBinding[] = input.metrics.map((metric) => ({
      id: randomUUID(),
      lifecycle: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      protocol: 'MQTT',
      sourceIdentity: gateway.sourceIdentity!,
      sourcePointId: input.rawPointId,
      metric,
      targetType: 'EQUIPMENT',
      targetId: breaker.id,
      attributes: {
        commissioning: mark,
        measurementSource: 'ACREL_METER_CHANNEL',
        sourceEquipmentId: meter.equipmentId,
        transportEquipmentId: gateway.equipmentId,
        observedEquipmentId: breaker.id,
        gatewayEquipmentId: gateway.equipmentId,
        meterEquipmentId: meter.equipmentId,
        channel: input.channel,
        confirmedBy: actorId,
        confirmedAt: now,
        evidence: input.evidence,
      },
    }));
    try {
      await this.bindings.insertBatch(bindings);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        return bad('BINDING_CONFLICT');
      throw error;
    }
    return good({ breakerId: breaker.id, created: bindings.map((binding) => binding.id) });
  }

  async retireChannel(input: RetireChannelInput, actorId: string):
    Promise<Result<{ readonly retired: readonly string[] }>> {
    if (!this.bindings.archiveBatch) return bad('ATOMIC_BINDINGS_REQUIRED');
    const breaker = await this.topology.getById(input.breakerId);
    if (breaker?.kind !== 'EQUIPMENT' || breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
        breaker.lifecycle !== 'ACTIVE') return bad('BREAKER_NOT_FOUND');
    const active = await this.bindings.listForTarget('EQUIPMENT', breaker.id);
    const matching = active.filter((binding) =>
      previouslyConfirmed(binding) && binding.protocol === 'MQTT' &&
      binding.sourceIdentity === input.sourceIdentity &&
      binding.sourcePointId === input.rawPointId);
    if (!matching.length) return bad('MAPPING_NOT_FOUND');
    const now = new Date().toISOString();
    const archived: TelemetryBinding[] = matching.map((binding) => ({
      ...binding,
      lifecycle: 'ARCHIVED',
      updatedAt: now,
      attributes: {
        ...binding.attributes,
        retiredAt: now,
        retiredBy: actorId,
        retirementEvidence: input.evidence,
      },
    }));
    try {
      await this.bindings.archiveBatch(archived);
    } catch (error) {
      if (error instanceof Error && error.message === 'STALE_BINDING') return bad('BINDING_CONFLICT');
      throw error;
    }
    return good({ retired: archived.map((binding) => binding.id) });
  }
}
