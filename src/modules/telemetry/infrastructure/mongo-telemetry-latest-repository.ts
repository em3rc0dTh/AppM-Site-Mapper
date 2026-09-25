import { type Collection, type Db, type Document, MongoServerError } from 'mongodb';

import {
  buildTelemetryReportedEntryRecency,
  type TelemetryLatestRepository,
} from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

type TelemetryLatestDocument = TelemetrySample & Document;

function toDomain(document: TelemetryLatestDocument): TelemetrySample {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;

  if (
    typeof copy.entityId !== 'string' ||
    (copy.entityKind !== 'DEVICE' && copy.entityKind !== 'EQUIPMENT') ||
    typeof copy.sourceId !== 'string' ||
    typeof copy.sourceIdentity !== 'string' ||
    typeof copy.serialNumber !== 'string' ||
    typeof copy.protocolProfile !== 'string' ||
    typeof copy.rawSchemaVersion !== 'string' ||
    typeof copy.reported !== 'object' ||
    copy.reported === null ||
    Array.isArray(copy.reported) ||
    (copy.reportedEntryRecency !== undefined &&
      (typeof copy.reportedEntryRecency !== 'object' ||
        copy.reportedEntryRecency === null ||
        Array.isArray(copy.reportedEntryRecency))) ||
    typeof copy.observedAt !== 'string' ||
    typeof copy.receivedAt !== 'string' ||
    (copy.timestampProvenance !== 'DEVICE' &&
      copy.timestampProvenance !== 'RECEIVED_TIME_FALLBACK') ||
    (copy.simulated !== undefined && typeof copy.simulated !== 'boolean')
  ) {
    throw new Error('Invalid telemetry latest document.');
  }

  return copy as unknown as TelemetrySample;
}

function literal(value: unknown): Document {
  return { $literal: value };
}

function latestUpdatePipeline(sample: TelemetrySample): Document[] {
  const incomingRecency = buildTelemetryReportedEntryRecency(sample);
  const sameStream = {
    $and: [
      { $eq: ['$sourceId', literal(sample.sourceId)] },
      { $eq: ['$serialNumber', literal(sample.serialNumber)] },
      { $eq: ['$protocolProfile', literal(sample.protocolProfile)] },
      { $eq: ['$rawSchemaVersion', literal(sample.rawSchemaVersion)] },
    ],
  };

  return [
    {
      $set: {
        entityId: literal(sample.entityId),
        entityKind: literal(sample.entityKind),
        sourceId: literal(sample.sourceId),
        sourceIdentity: literal(sample.sourceIdentity),
        serialNumber: literal(sample.serialNumber),
        protocolProfile: literal(sample.protocolProfile),
        rawSchemaVersion: literal(sample.rawSchemaVersion),
        reported: {
          $cond: [
            sameStream,
            {
              $mergeObjects: [{ $ifNull: ['$reported', literal({})] }, literal(sample.reported)],
            },
            literal(sample.reported),
          ],
        },
        reportedEntryRecency: {
          $cond: [
            sameStream,
            {
              $mergeObjects: [
                { $ifNull: ['$reportedEntryRecency', literal({})] },
                literal(incomingRecency),
              ],
            },
            literal(incomingRecency),
          ],
        },
        observedAt: literal(sample.observedAt),
        receivedAt: literal(sample.receivedAt),
        timestampProvenance: literal(sample.timestampProvenance),
        sequence: sample.sequence === undefined ? '$$REMOVE' : literal(sample.sequence),
        producerEpoch:
          sample.producerEpoch === undefined ? '$$REMOVE' : literal(sample.producerEpoch),
        messageId: sample.messageId === undefined ? '$$REMOVE' : literal(sample.messageId),
        sourceMessageId:
          sample.sourceMessageId === undefined ? '$$REMOVE' : literal(sample.sourceMessageId),
        sourceTimestampSeconds:
          sample.sourceTimestampSeconds === undefined
            ? '$$REMOVE'
            : literal(sample.sourceTimestampSeconds),
        sourceSendTimeSeconds:
          sample.sourceSendTimeSeconds === undefined
            ? '$$REMOVE'
            : literal(sample.sourceSendTimeSeconds),
        sourceMethod: sample.sourceMethod === undefined ? '$REMOVE' : literal(sample.sourceMethod),
        sourceVersion:
          sample.sourceVersion === undefined ? '$$REMOVE' : literal(sample.sourceVersion),
        simulated: sample.simulated === undefined ? '$$REMOVE' : literal(sample.simulated),
      },
    },
  ];
}

export class MongoTelemetryLatestRepository implements TelemetryLatestRepository {
  private readonly collection: Collection<TelemetryLatestDocument>;

  constructor(database: Db) {
    this.collection = database.collection<TelemetryLatestDocument>('telemetry_latest');
  }

  async getByEntityId(entityId: string): Promise<TelemetrySample | null> {
    const document = await this.collection.findOne({ entityId });
    return document ? toDomain(document) : null;
  }

  async list(): Promise<readonly TelemetrySample[]> {
    const documents = await this.collection.find({}).sort({ entityId: 1 }).toArray();
    return documents.map(toDomain);
  }

  async upsertIfNewer(sample: TelemetrySample): Promise<boolean> {
    try {
      const result = await this.collection.updateOne(
        {
          entityId: sample.entityId,
          $or: [
            { observedAt: { $lt: sample.observedAt } },
            {
              observedAt: sample.observedAt,
              receivedAt: { $lt: sample.receivedAt },
            },
            { observedAt: { $exists: false } },
          ],
        },
        latestUpdatePipeline(sample),
        { upsert: true },
      );

      return result.matchedCount === 1 || result.upsertedCount === 1;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return false;
      }

      throw error;
    }
  }
}
