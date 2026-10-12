import { createHash } from 'node:crypto';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetryHistoryWriter } from '@/modules/telemetry/application/telemetry-history-writer';
import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { buildBfdbBreakerReadings } from '@/modules/telemetry/domain/bfdb';
import type {
  TelemetryBinding,
  TelemetrySample,
  TelemetryTargetType,
} from '@/modules/telemetry/domain/entities';
import {
  normalizeTelemetry,
  type TelemetryNormalizationError,
  type TelemetryNormalizerOptions,
} from '@/modules/telemetry/domain/normalizer';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryIngestError =
  | TelemetryNormalizationError
  | 'UNKNOWN_SOURCE'
  | 'AMBIGUOUS_SOURCE_BINDING'
  | 'INVALID_BINDING_TARGET';

export interface TelemetryIntegrationOptions {
  readonly configuredBindings?: readonly TelemetryBinding[];
}

interface ResolvedTarget {
  readonly id: string;
  readonly type: TelemetryTargetType;
}

export class TelemetryService {
  constructor(
    private readonly topologyRepository: TopologyRepository,
    private readonly hub: TelemetryHub,
    private readonly normalizerOptions: TelemetryNormalizerOptions,
    private readonly integrationOptions: TelemetryIntegrationOptions = {},
    private readonly bindingRepository?: TelemetryBindingRepository,
    private readonly historyWriter?: TelemetryHistoryWriter,
  ) {}

  async ingest(
    topic: string,
    payload: Uint8Array,
    receivedAt?: string,
  ): Promise<Result<TelemetrySample, TelemetryIngestError>> {
    const normalized = normalizeTelemetry(topic, payload, this.normalizerOptions, receivedAt);
    if (!normalized.ok) return normalized;

    const bindings = await this.bindingsFor(normalized.value.sourceIdentity);
    const sourceBindings = bindings.filter(
      (binding) => !binding.sourcePointId && binding.metric.toUpperCase() === 'SOURCE',
    );

    // Persisted SOURCE mappings take priority over deprecated environment aliases.
    // An invalid persisted mapping fails closed; it is never silently reassigned.
    const persistedSourceBindings = sourceBindings.filter(
      (binding) => !binding.id.startsWith('env:mqtt:'),
    );
    if (persistedSourceBindings.length > 1) return failure('AMBIGUOUS_SOURCE_BINDING');
    const configuredSourceBindings = sourceBindings.filter((binding) =>
      binding.id.startsWith('env:mqtt:'),
    );
    if (configuredSourceBindings.length > 1) return failure('AMBIGUOUS_SOURCE_BINDING');

    let sourceBinding = persistedSourceBindings[0] ?? configuredSourceBindings[0];
    let target = sourceBinding ? await this.resolveTarget(sourceBinding) : null;
    if (sourceBinding && !target && !sourceBinding.id.startsWith('env:mqtt:')) {
      return failure('INVALID_BINDING_TARGET');
    }

    if (!target) {
      // First honor verified point bindings; next try unambiguous physical SN.
      const inferred = await this.inferSourceBinding(normalized.value.sourceIdentity, bindings);
      if (inferred.ok) {
        sourceBinding = inferred.value;
        target = await this.resolveTarget(inferred.value);
      } else if (inferred.error === 'AMBIGUOUS_SOURCE_BINDING') {
        return inferred;
      }
    }

    if (!target) {
      const discovered = await this.discoverSourceBinding(normalized.value.sourceIdentity);
      if (!discovered.ok) {
        return failure(
          sourceBinding && !target && discovered.error === 'UNKNOWN_SOURCE'
            ? 'INVALID_BINDING_TARGET'
            : discovered.error,
        );
      }
      sourceBinding = discovered.value;
      target = await this.resolveTarget(sourceBinding);
    }
    if (!target || !sourceBinding) return failure('INVALID_BINDING_TARGET');

    // Auto-discovered sources are bound to an inventory identity, not merely
    // the old UUID. Re-check on ingestion so renaming/archive/duplicate SN
    // cannot silently redirect measurements through a stale SOURCE binding.
    if (sourceBinding.attributes?.discovery === 'UNIQUE_INVENTORY_SN') {
      const matches = await this.topologyRepository.findActiveBySerialNumber(
        normalized.value.sourceIdentity,
      );
      if (matches.length > 1) return failure('AMBIGUOUS_SOURCE_BINDING');
      const match = matches[0];
      if (!match || match.id !== sourceBinding.attributes.matchedNodeId)
        return failure('INVALID_BINDING_TARGET');
      if (match.kind === 'EQUIPMENT') {
        const device = await this.topologyRepository.getById(match.deviceId);
        if (
          match.equipmentType !== 'CHASSIS' ||
          match.parentEquipmentId !== null ||
          match.parentId !== target.id ||
          device?.kind !== 'DEVICE' ||
          device.deviceType !== 'BDFB' ||
          device.lifecycle !== 'ACTIVE' ||
          !device.rootEquipmentIds.includes(match.id)
        )
          return failure('INVALID_BINDING_TARGET');
      } else if (match.kind !== 'DEVICE' || match.deviceType !== 'BDFB' || match.id !== target.id) {
        return failure('INVALID_BINDING_TARGET');
      }
    }

    let breakerReadings: ReturnType<typeof buildBfdbBreakerReadings> = {
      readings: [],
      unmappedPointIds: [],
    };

    if (target.type === 'DEVICE') {
      const projection = await new BdfbProjectionService(this.topologyRepository).get(target.id);
      if (projection) {
        breakerReadings = buildBfdbBreakerReadings(projection, normalized.value, bindings);
      }
    }

    const sample: TelemetrySample = {
      bindingId: sourceBinding.id,
      targetId: target.id,
      targetType: target.type,
      entityId: target.id,
      entityKind: target.type,
      sourceIdentity: normalized.value.sourceIdentity,
      reported: normalized.value.reported,
      receivedAt: normalized.value.receivedAt,
      protocol: normalized.value.protocol,
      ...(normalized.value.messageId ? { messageId: normalized.value.messageId } : {}),
      ...(normalized.value.sourceObservedAt
        ? { sourceObservedAt: normalized.value.sourceObservedAt }
        : {}),
      ...(normalized.value.sourceSentAt ? { sourceSentAt: normalized.value.sourceSentAt } : {}),
      ...(breakerReadings.readings.length ? { breakerReadings: breakerReadings.readings } : {}),
      ...(breakerReadings.unmappedPointIds.length
        ? { unmappedPointIds: breakerReadings.unmappedPointIds }
        : {}),
    };

    this.hub.publish(sample);
    await this.historyWriter?.write(sample);
    return success(this.hub.latest(target.id) ?? sample);
  }

  latest(targetId: string): TelemetrySample | null {
    return this.hub.latest(targetId);
  }

  snapshot(): readonly TelemetrySample[] {
    return this.hub.snapshot();
  }

  private async bindingsFor(sourceIdentity: string): Promise<readonly TelemetryBinding[]> {
    const configured = (this.integrationOptions.configuredBindings ?? []).filter(
      (binding) =>
        binding.lifecycle === 'ACTIVE' &&
        binding.protocol === 'MQTT' &&
        binding.sourceIdentity === sourceIdentity,
    );
    const persisted = this.bindingRepository
      ? await this.bindingRepository.listForSource('MQTT', sourceIdentity)
      : [];

    const merged = new Map<string, TelemetryBinding>();
    for (const binding of [...persisted, ...configured]) merged.set(binding.id, binding);
    return [...merged.values()];
  }

  private async inferSourceBinding(
    sourceIdentity: string,
    bindings: readonly TelemetryBinding[],
  ): Promise<Result<TelemetryBinding, TelemetryIngestError>> {
    const deviceIds = new Set<string>();

    for (const binding of bindings) {
      if (
        binding.lifecycle !== 'ACTIVE' ||
        binding.protocol !== 'MQTT' ||
        binding.sourceIdentity !== sourceIdentity ||
        !binding.sourcePointId
      ) {
        continue;
      }

      if (binding.targetType === 'DEVICE') {
        deviceIds.add(binding.targetId);
        continue;
      }

      if (binding.targetType === 'EQUIPMENT') {
        const equipment = await this.topologyRepository.getById(binding.targetId);
        if (equipment?.kind === 'EQUIPMENT' && equipment.lifecycle === 'ACTIVE') {
          deviceIds.add(equipment.deviceId);
        }
        continue;
      }

      if (binding.targetType === 'ACCESS_PORT') {
        const equipment = await this.topologyRepository.getEquipmentByAccessPortId(
          binding.targetId,
        );
        if (equipment?.lifecycle === 'ACTIVE') deviceIds.add(equipment.deviceId);
      }
    }

    if (deviceIds.size === 0) return failure('UNKNOWN_SOURCE');
    if (deviceIds.size !== 1) return failure('AMBIGUOUS_SOURCE_BINDING');

    const targetId = [...deviceIds][0]!;
    const target = await this.topologyRepository.getById(targetId);
    if (!target || target.kind !== 'DEVICE' || target.lifecycle !== 'ACTIVE') {
      return failure('INVALID_BINDING_TARGET');
    }

    const timestamp = new Date().toISOString();
    return success({
      id: `inferred:mqtt:${sourceIdentity}`,
      protocol: 'MQTT',
      sourceIdentity,
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId,
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  /**
   * Auto-resolve a BFDB MQTT publisher from its *unique active* inventory SN.
   * Only a BDFB Device or its active root CHASSIS can identify a publisher.
   * Breaker SNs, nested modules, duplicates and stale parents are not eligible.
   * The SOURCE binding is durable; raw circuit points are NEVER guessed.
   */
  private async discoverSourceBinding(
    sourceIdentity: string,
  ): Promise<Result<TelemetryBinding, TelemetryIngestError>> {
    if (!sourceIdentity || sourceIdentity.length > 120) return failure('UNKNOWN_SOURCE');
    const matches = await this.topologyRepository.findActiveBySerialNumber(sourceIdentity);
    if (matches.length === 0) return failure('UNKNOWN_SOURCE');
    if (matches.length > 1) return failure('AMBIGUOUS_SOURCE_BINDING');

    const match = matches[0]!;
    let deviceId: string;
    if (match.kind === 'DEVICE') {
      if (match.deviceType !== 'BDFB') return failure('INVALID_BINDING_TARGET');
      deviceId = match.id;
    } else if (match.kind === 'EQUIPMENT') {
      if (match.equipmentType !== 'CHASSIS' || match.parentEquipmentId !== null)
        return failure('INVALID_BINDING_TARGET');
      deviceId = match.deviceId;
      const device = await this.topologyRepository.getById(deviceId);
      if (
        !device ||
        device.kind !== 'DEVICE' ||
        device.lifecycle !== 'ACTIVE' ||
        device.deviceType !== 'BDFB' ||
        match.parentId !== device.id ||
        !device.rootEquipmentIds.includes(match.id)
      )
        return failure('INVALID_BINDING_TARGET');
    } else {
      return failure('INVALID_BINDING_TARGET');
    }

    const target = await this.topologyRepository.getById(deviceId);
    if (!target || target.kind !== 'DEVICE' || target.lifecycle !== 'ACTIVE')
      return failure('INVALID_BINDING_TARGET');

    const timestamp = new Date().toISOString();
    const binding: TelemetryBinding = {
      id: `auto:mqtt:${createHash('sha256').update(sourceIdentity).digest('hex')}`,
      protocol: 'MQTT',
      sourceIdentity,
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId: deviceId,
      lifecycle: 'ACTIVE',
      attributes: { discovery: 'UNIQUE_INVENTORY_SN', matchedNodeId: match.id },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // Durable when a repository is provided (always true in the real runtime).
    // Unique Mongo index makes concurrent publications idempotent and prevents
    // two active SOURCE bindings for the same publisher identity.
    if (this.bindingRepository) {
      try {
        await this.bindingRepository.insert(binding);
      } catch (error) {
        // A competing process may have inserted the same source atomically.
        // Never swallow database outages or other persistence errors.
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000)
          throw error;
        const persisted = (
          await this.bindingRepository.listForSource('MQTT', sourceIdentity)
        ).filter(
          (candidate) => !candidate.sourcePointId && candidate.metric.toUpperCase() === 'SOURCE',
        );
        if (
          persisted.length !== 1 ||
          persisted[0]?.targetType !== 'DEVICE' ||
          persisted[0]?.targetId !== deviceId
        )
          return failure('AMBIGUOUS_SOURCE_BINDING');
        return success(persisted[0]);
      }
    }
    return success(binding);
  }

  private async resolveTarget(binding: TelemetryBinding): Promise<ResolvedTarget | null> {
    if (binding.targetType === 'ACCESS_PORT') {
      const equipment = await this.topologyRepository.getEquipmentByAccessPortId(binding.targetId);
      const port = equipment?.accessPorts.find(
        (candidate) => candidate.id === binding.targetId && candidate.lifecycle === 'ACTIVE',
      );
      return equipment && port ? { id: binding.targetId, type: 'ACCESS_PORT' } : null;
    }

    const node = await this.topologyRepository.getById(binding.targetId);
    if (!node || node.lifecycle !== 'ACTIVE' || node.kind !== binding.targetType) {
      return null;
    }

    return { id: node.id, type: binding.targetType };
  }
}
