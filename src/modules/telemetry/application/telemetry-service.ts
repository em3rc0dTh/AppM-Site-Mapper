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

    let sourceBinding = sourceBindings[0];
    if (sourceBindings.length > 1) return failure('AMBIGUOUS_SOURCE_BINDING');

    if (!sourceBinding) {
      const inferred = await this.inferSourceBinding(normalized.value.sourceIdentity, bindings);
      if (!inferred.ok) return inferred;
      sourceBinding = inferred.value;
    }

    const target = await this.resolveTarget(sourceBinding);
    if (!target) return failure('INVALID_BINDING_TARGET');

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
        const equipment = await this.topologyRepository.getEquipmentByAccessPortId(binding.targetId);
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
