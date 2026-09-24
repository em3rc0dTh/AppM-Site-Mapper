import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetryLatestRepository } from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetrySourceRepository } from '@/modules/telemetry/application/telemetry-source-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import {
  normalizeTelemetry,
  type TelemetryNormalizationError,
  type TelemetryNormalizerOptions,
} from '@/modules/telemetry/domain/normalizer';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryIngestError =
  | TelemetryNormalizationError
  | 'UNKNOWN_SOURCE'
  | 'SOURCE_DISABLED'
  | 'SOURCE_IDENTITY_MISMATCH';

export class TelemetryService {
  constructor(
    private readonly sources: TelemetrySourceRepository,
    private readonly latestRepository: TelemetryLatestRepository,
    private readonly hub: TelemetryHub,
    private readonly normalizerOptions: TelemetryNormalizerOptions,
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

    const source = await this.sources.findByTopicSource(normalized.value.topicSource);

    if (!source) {
      return failure('UNKNOWN_SOURCE');
    }

    if (!source.enabled) {
      return failure('SOURCE_DISABLED');
    }

    if (source.expectedSerialNumber !== normalized.value.serialNumber) {
      return failure('SOURCE_IDENTITY_MISMATCH');
    }

    const sample: TelemetrySample = {
      entityId: source.entityId,
      entityKind: source.entityKind,
      sourceId: source.id,
      sourceIdentity: normalized.value.serialNumber,
      serialNumber: normalized.value.serialNumber,
      rawSchemaVersion: source.rawSchemaVersion,
      reported: normalized.value.reported,
      observedAt: normalized.value.observedAt,
      receivedAt: normalized.value.receivedAt,
      timestampProvenance: normalized.value.timestampProvenance,
      ...(normalized.value.sequence === undefined ? {} : { sequence: normalized.value.sequence }),
      ...(normalized.value.messageId === undefined ? {} : { messageId: normalized.value.messageId }),
    };

    const becameLatest = await this.latestRepository.upsertIfNewer(sample);

    if (becameLatest) {
      this.hub.publish(sample);
    }

    return success(sample);
  }

  latest(entityId: string): Promise<TelemetrySample | null> {
    return this.latestRepository.getByEntityId(entityId);
  }

  snapshot(): Promise<readonly TelemetrySample[]> {
    return this.latestRepository.list();
  }
}
