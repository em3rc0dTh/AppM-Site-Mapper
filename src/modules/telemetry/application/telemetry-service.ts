import type { TelemetryAcceptanceRepository } from '@/modules/telemetry/application/telemetry-acceptance-repository';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import {
  buildTelemetryIdempotencyKey,
  sha256Payload,
} from '@/modules/telemetry/application/telemetry-idempotency';
import type { TelemetryLatestRepository } from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetryQuarantineRepository } from '@/modules/telemetry/application/telemetry-quarantine-repository';
import type { TelemetrySourceRepository } from '@/modules/telemetry/application/telemetry-source-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import {
  normalizeTelemetry,
  type TelemetryNormalizationError,
  type TelemetryNormalizerOptions,
} from '@/modules/telemetry/domain/normalizer';
import { createDomainId } from '@/shared/domain/entity';
import { failure, success, type Result } from '@/shared/domain/result';

export type TelemetryIngestError =
  | TelemetryNormalizationError
  | 'UNKNOWN_SOURCE'
  | 'SOURCE_DISABLED'
  | 'SOURCE_IDENTITY_MISMATCH'
  | 'IDEMPOTENCY_CONFLICT';

export interface TelemetryServiceOptions extends TelemetryNormalizerOptions {
  readonly quarantineRetentionDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function expiresAt(receivedAt: string, retentionDays: number): string {
  const timestamp = Date.parse(receivedAt);

  if (!Number.isFinite(timestamp)) {
    throw new Error('Telemetry receivedAt must be a valid ISO timestamp.');
  }

  return new Date(timestamp + retentionDays * DAY_MS).toISOString();
}

export class TelemetryService {
  constructor(
    private readonly sources: TelemetrySourceRepository,
    private readonly latestRepository: TelemetryLatestRepository,
    private readonly acceptance: TelemetryAcceptanceRepository,
    private readonly quarantine: TelemetryQuarantineRepository,
    private readonly hub: TelemetryHub,
    private readonly options: TelemetryServiceOptions,
  ) {
    if (!Number.isInteger(options.quarantineRetentionDays) || options.quarantineRetentionDays < 1) {
      throw new Error('Telemetry quarantineRetentionDays must be a positive integer.');
    }
  }

  async ingest(
    topic: string,
    payload: Uint8Array,
    receivedAt?: string,
  ): Promise<Result<TelemetrySample, TelemetryIngestError>> {
    const ingestReceivedAt = receivedAt ?? new Date().toISOString();
    const payloadSha256 = sha256Payload(payload);
    const normalized = normalizeTelemetry(topic, payload, this.options, ingestReceivedAt);

    if (!normalized.ok) {
      await this.recordRejection({
        topic,
        payload,
        payloadSha256,
        receivedAt: ingestReceivedAt,
        failureCode: normalized.error,
      });
      return failure(normalized.error);
    }

    const source = await this.sources.findByTopicSource(normalized.value.topicSource);

    if (!source) {
      await this.recordRejection({
        topic,
        payload,
        payloadSha256,
        receivedAt: ingestReceivedAt,
        failureCode: 'UNKNOWN_SOURCE',
        claimedSerialNumber: normalized.value.serialNumber,
      });
      return failure('UNKNOWN_SOURCE');
    }

    if (!source.enabled) {
      await this.recordRejection({
        topic,
        payload,
        payloadSha256,
        receivedAt: ingestReceivedAt,
        failureCode: 'SOURCE_DISABLED',
        sourceId: source.id,
        claimedSerialNumber: normalized.value.serialNumber,
      });
      return failure('SOURCE_DISABLED');
    }

    if (source.expectedSerialNumber !== normalized.value.serialNumber) {
      await this.recordRejection({
        topic,
        payload,
        payloadSha256,
        receivedAt: ingestReceivedAt,
        failureCode: 'SOURCE_IDENTITY_MISMATCH',
        sourceId: source.id,
        claimedSerialNumber: normalized.value.serialNumber,
      });
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
      ...(normalized.value.producerEpoch === undefined
        ? {}
        : { producerEpoch: normalized.value.producerEpoch }),
      ...(normalized.value.messageId === undefined
        ? {}
        : { messageId: normalized.value.messageId }),
    };

    const idempotencyKey = buildTelemetryIdempotencyKey(source.id, normalized.value);
    const acceptanceResult = await this.acceptance.accept({
      eventId: createDomainId(),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      payloadSha256,
      sample,
      acceptedAt: ingestReceivedAt,
      historyState: 'PENDING',
      historyAttempts: 0,
    });

    if (acceptanceResult.kind === 'CONFLICT') {
      await this.recordRejection({
        topic,
        payload,
        payloadSha256,
        receivedAt: ingestReceivedAt,
        failureCode: 'IDEMPOTENCY_CONFLICT',
        sourceId: source.id,
        claimedSerialNumber: normalized.value.serialNumber,
      });
      return failure('IDEMPOTENCY_CONFLICT');
    }

    const durableSample = acceptanceResult.record.sample;
    const becameLatest = await this.latestRepository.upsertIfNewer(durableSample);

    if (becameLatest) {
      this.hub.publish(durableSample);
    }

    return success(durableSample);
  }

  latest(entityId: string): Promise<TelemetrySample | null> {
    return this.latestRepository.getByEntityId(entityId);
  }

  snapshot(): Promise<readonly TelemetrySample[]> {
    return this.latestRepository.list();
  }

  private async recordRejection(input: {
    readonly topic: string;
    readonly payload: Uint8Array;
    readonly payloadSha256: string;
    readonly receivedAt: string;
    readonly failureCode: TelemetryIngestError;
    readonly sourceId?: string;
    readonly claimedSerialNumber?: string;
  }): Promise<void> {
    await this.quarantine.record({
      id: createDomainId(),
      receivedAt: input.receivedAt,
      expiresAt: expiresAt(input.receivedAt, this.options.quarantineRetentionDays),
      topic: input.topic,
      failureCode: input.failureCode,
      payloadBytes: input.payload.byteLength,
      payloadSha256: input.payloadSha256,
      ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      ...(input.claimedSerialNumber === undefined
        ? {}
        : { claimedSerialNumber: input.claimedSerialNumber }),
    });
  }
}
