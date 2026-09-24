import { type Collection, type Db, type Document, MongoServerError } from 'mongodb';

import type { TelemetryLatestRepository } from '@/modules/telemetry/application/telemetry-latest-repository';
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
    typeof copy.rawSchemaVersion !== 'string' ||
    typeof copy.reported !== 'object' ||
    copy.reported === null ||
    Array.isArray(copy.reported) ||
    typeof copy.observedAt !== 'string' ||
    typeof copy.receivedAt !== 'string' ||
    (copy.timestampProvenance !== 'DEVICE' && copy.timestampProvenance !== 'RECEIVED_TIME_FALLBACK')
  ) {
    throw new Error('Invalid telemetry latest document.');
  }

  return copy as unknown as TelemetrySample;
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
        { $set: sample },
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
