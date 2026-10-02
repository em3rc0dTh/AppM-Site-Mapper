import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
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
  ) {}

  async ingest(
    topic: string,
    payload: Uint8Array,
    receivedAt?: string,
  ): Promise<Result<TelemetrySample, TelemetryIngestError>> {
    const normalized = normalizeTelemetry(topic, payload, this.normalizerOptions, receivedAt);
    if (!normalized.ok) return normalized;

    const bindings = await this.bindingsFor(normalized.value.sourceIdentity);
    const sourceBindings = bindings.filter((binding) => !binding.sourcePointId);
    if (sourceBindings.length === 0) return failure('UNKNOWN_SOURCE');
    if (sourceBindings.length !== 1) return failure('AMBIGUOUS_SOURCE_BINDING');

    const sourceBinding = sourceBindings[0]!;
    const target = await this.resolveTarget(sourceBinding);
    if (!target) return failure('INVALID_BINDING_TARGET');

    let breakerReadings: ReturnType<typeof buildBdfbBreakerReadings> = {
      readings: [],
      unmappedPointIds: [],
    };

    if (target.type === 'DEVICE') {
      const projection = await new BdfbProjectionService(this.topologyRepository).get(target.id);
      if (projection) {
        breakerReadings = buildBdfbBreakerReadings(projection, normalized.value, bindings);
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
      ...(breakerReadings.readings.length
        ? { breakerReadings: breakerReadings.readings }
        : {}),
      ...(breakerReadings.unmappedPointIds.length
        ? { unmappedPointIds: breakerReadings.unmappedPointIds }
        : {}),
    };

    this.hub.publish(sample);
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

  private async resolveTarget(binding: TelemetryBinding): Promise<ResolvedTarget | null> {
    if (binding.targetType === 'ACCESS_PORT') {
      const equipment = await this.topologyRepository.getEquipmentByAccessPortId(binding.targetId);
      const port = equipment?.accessPorts.find(
        (candidate) => candidate.id === binding.targetId && candidate.lifecycle === 'ACTIVE',
      );
      return equipment && port ? { id: binding.targetId, type: 'ACCESS_PORT' } : null;
    }

    const node = await this.topologyRepository.getById(binding.targetId);
    if (
      !node ||
      node.lifecycle !== 'ACTIVE' ||
      node.kind !== binding.targetType
    ) {
      return null;
    }

    return { id: node.id, type: binding.targetType };
  }
}
