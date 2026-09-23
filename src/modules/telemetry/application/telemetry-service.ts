import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
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

export class TelemetryService {
  constructor(
    private readonly topologyRepository: TopologyRepository,
    private readonly hub: TelemetryHub,
    private readonly normalizerOptions: TelemetryNormalizerOptions,
  ) {}

  async ingest(
    topic: string,
    payload: Uint8Array,
    receivedAt?: string,
  ): Promise<Result<TelemetrySample, TelemetryIngestError>> {
    const normalized = normalizeTelemetry(
      topic,
      payload,
      this.normalizerOptions,
      receivedAt,
    );

    if (!normalized.ok) {
      return normalized;
    }

    const entity = await this.resolveSource(normalized.value.sourceIdentity);

    if (!entity) {
      return failure('UNKNOWN_SOURCE');
    }

    const sample: TelemetrySample = {
      entityId: entity.id,
      entityKind: entity.kind,
      sourceIdentity: normalized.value.sourceIdentity,
      reported: normalized.value.reported,
      receivedAt: normalized.value.receivedAt,
    };

    this.hub.publish(sample);
    return success(sample);
  }

  latest(entityId: string): TelemetrySample | null {
    return this.hub.latest(entityId);
  }

  snapshot(): readonly TelemetrySample[] {
    return this.hub.snapshot();
  }

  private async resolveSource(
    sourceIdentity: string,
  ): Promise<TelemetryEntity | null> {
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

    return candidates.length === 1 ? candidates[0] ?? null : null;
  }
}
