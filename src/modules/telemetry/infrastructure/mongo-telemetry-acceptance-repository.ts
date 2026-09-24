import {
  type Collection,
  type Db,
  type Document,
  MongoServerError,
  type OptionalUnlessRequiredId,
} from 'mongodb';

import type { TelemetryAcceptanceRepository } from '@/modules/telemetry/application/telemetry-acceptance-repository';
import type {
  TelemetryAcceptanceRecord,
  TelemetryAcceptanceResult,
} from '@/modules/telemetry/domain/acceptance';
import { isTelemetryAcceptanceRecord } from '@/modules/telemetry/domain/validation';

type TelemetryAcceptanceDocument = TelemetryAcceptanceRecord & Document;

function toDomain(document: TelemetryAcceptanceDocument): TelemetryAcceptanceRecord {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;

  if (!isTelemetryAcceptanceRecord(copy)) {
    throw new Error('Invalid telemetry acceptance document.');
  }

  return copy;
}

export class MongoTelemetryAcceptanceRepository implements TelemetryAcceptanceRepository {
  private readonly collection: Collection<TelemetryAcceptanceDocument>;

  constructor(database: Db) {
    this.collection = database.collection<TelemetryAcceptanceDocument>('telemetry_outbox');
  }

  async accept(record: TelemetryAcceptanceRecord): Promise<TelemetryAcceptanceResult> {
    try {
      await this.collection.insertOne(
        record as OptionalUnlessRequiredId<TelemetryAcceptanceDocument>,
      );
      return { kind: 'ACCEPTED', record: structuredClone(record) };
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000 || !record.idempotencyKey) {
        throw error;
      }

      const existingDocument = await this.collection.findOne({
        idempotencyKey: record.idempotencyKey,
      });

      if (!existingDocument) {
        throw error;
      }

      const existing = toDomain(existingDocument);

      return {
        kind: existing.payloadSha256 === record.payloadSha256 ? 'DUPLICATE' : 'CONFLICT',
        record: existing,
      };
    }
  }

  async listPendingHistory(limit: number): Promise<readonly TelemetryAcceptanceRecord[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    const documents = await this.collection
      .find({ historyState: 'PENDING' })
      .sort({ acceptedAt: 1 })
      .limit(boundedLimit)
      .toArray();

    return documents.map(toDomain);
  }
}
