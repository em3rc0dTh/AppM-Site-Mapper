import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import {
  buildBfdbBreakerReadings,
  type BfdbBindingMode,
} from '@/modules/telemetry/domain/bfdb';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import {
  normalizeTelemetry,
  type TelemetryNormalizationError,
  type TelemetryNormalizerOptions,
} from '@/modules/telemetry/domain/normalizer';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryIngestError = TelemetryNormalizationError | 'UNKNOWN_SOURCE';

type TelemetryEntity = DeviceNode | EquipmentNode;

export interface TelemetryIntegrationOptions {
  readonly sourceDeviceMap?: Readonly<Record<string, string>>;
  readonly bfdbBindingMode?: BfdbBindingMode;
  readonly bfdbPositionsPerPanel?: number;
}

export class TelemetryService {
  constructor(
    private readonly topologyRepository: TopologyRepository,
    private readonly hub: TelemetryHub,
    private readonly normalizerOptions: TelemetryNormalizerOptions,
    private readonly integrationOptions: TelemetryIntegrationOptions = {},
  ) {}

  async ingest(
    topic: string,
    payload: Uint8Array,
    receivedAt?: string,
  ): Promise<Result<TelemetrySample, TelemetryIngestError>> {
    const normalized = normalizeTelemetry(topic, payload, this.normalizerOptions, receivedAt);

    if (!normalized.ok) {
      return normalized;
    }

    const entity = await this.resolveSource(normalized.value.sourceIdentity);

    if (!entity) {
      return failure('UNKNOWN_SOURCE');
    }

    const bfdb =
      entity.kind === 'DEVICE'
        ? buildBfdbBreakerReadings(entity, normalized.value, {
            mode: this.integrationOptions.bfdbBindingMode ?? 'panel-order-24',
            positionsPerPanel: this.integrationOptions.bfdbPositionsPerPanel ?? 24,
          })
        : { readings: [], unmappedPointIds: [] };

    const sample: TelemetrySample = {
      entityId: entity.id,
      entityKind: entity.kind,
      sourceIdentity: normalized.value.sourceIdentity,
      reported: normalized.value.reported,
      receivedAt: normalized.value.receivedAt,
      protocol: normalized.value.protocol,
      ...(normalized.value.messageId ? { messageId: normalized.value.messageId } : {}),
      ...(normalized.value.sourceObservedAt
        ? { sourceObservedAt: normalized.value.sourceObservedAt }
        : {}),
      ...(normalized.value.sourceSentAt ? { sourceSentAt: normalized.value.sourceSentAt } : {}),
      ...(bfdb.readings.length ? { breakerReadings: bfdb.readings } : {}),
      ...(bfdb.unmappedPointIds.length ? { unmappedPointIds: bfdb.unmappedPointIds } : {}),
    };

    this.hub.publish(sample);
    return success(this.hub.latest(entity.id) ?? sample);
  }

  latest(entityId: string): TelemetrySample | null {
    return this.hub.latest(entityId);
  }

  snapshot(): readonly TelemetrySample[] {
    return this.hub.snapshot();
  }

  private async resolveSource(sourceIdentity: string): Promise<TelemetryEntity | null> {
    const mappedDeviceId = this.integrationOptions.sourceDeviceMap?.[sourceIdentity];

    if (mappedDeviceId) {
      const mapped = await this.topologyRepository.getById(mappedDeviceId);
      if (
        mapped &&
        (mapped.kind === 'DEVICE' || mapped.kind === 'EQUIPMENT') &&
        mapped.lifecycle === 'ACTIVE'
      ) {
        return mapped;
      }

      return null;
    }

    const [devices, equipment] = await Promise.all([
      this.topologyRepository.listByKind('DEVICE'),
      this.topologyRepository.listByKind('EQUIPMENT'),
    ]);

    const candidates = [...devices, ...equipment].filter(
      (node): node is TelemetryEntity =>
        (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') &&
        node.lifecycle === 'ACTIVE' &&
        node.serialNumber === sourceIdentity,
    );

    return candidates.length === 1 ? (candidates[0] ?? null) : null;
  }
}
