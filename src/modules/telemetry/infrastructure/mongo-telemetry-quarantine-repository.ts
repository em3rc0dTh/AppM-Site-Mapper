import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TelemetryQuarantineRepository } from '@/modules/telemetry/application/telemetry-quarantine-repository';
import type { TelemetryQuarantineRecord } from '@/modules/telemetry/domain/quarantine';
import { isTelemetryQuarantineRecord } from '@/modules/telemetry/domain/validation';

interface TelemetryQuarantineDocument extends Document {
  id: string;
  receivedAt: Date;
  expiresAt: Date;
  topic: string;
  failureCode: string;
  payloadBytes: number;
  payloadSha256: string;
  sourceId?: string;
  claimedSerialNumber?: string;
}

function toDomain(document: TelemetryQuarantineDocument): TelemetryQuarantineRecord {
  const candidate: Record<string, unknown> = {
    id: document.id,
    receivedAt: document.receivedAt.toISOString(),
    expiresAt: document.expiresAt.toISOString(),
    topic: document.topic,
    failureCode: document.failureCode,
    payloadBytes: document.payloadBytes,
    payloadSha256: document.payloadSha256,
    ...(document.sourceId === undefined ? {} : { sourceId: document.sourceId }),
    ...(document.claimedSerialNumber === undefined
      ? {}
      : { claimedSerialNumber: document.claimedSerialNumber }),
  };

  if (!isTelemetryQuarantineRecord(candidate)) {
    throw new Error('Invalid telemetry quarantine document.');
  }

  return candidate;
}

function toDocument(entry: TelemetryQuarantineRecord): TelemetryQuarantineDocument {
  return {
    id: entry.id,
    receivedAt: new Date(entry.receivedAt),
    expiresAt: new Date(entry.expiresAt),
    topic: entry.topic,
    failureCode: entry.failureCode,
    payloadBytes: entry.payloadBytes,
    payloadSha256: entry.payloadSha256,
    ...(entry.sourceId === undefined ? {} : { sourceId: entry.sourceId }),
    ...(entry.claimedSerialNumber === undefined
      ? {}
      : { claimedSerialNumber: entry.claimedSerialNumber }),
  };
}

export class MongoTelemetryQuarantineRepository implements TelemetryQuarantineRepository {
  private readonly collection: Collection<TelemetryQuarantineDocument>;

  constructor(database: Db) {
    this.collection = database.collection<TelemetryQuarantineDocument>('telemetry_quarantine');
  }

  async record(entry: TelemetryQuarantineRecord): Promise<void> {
    await this.collection.insertOne(
      toDocument(entry) as OptionalUnlessRequiredId<TelemetryQuarantineDocument>,
    );
  }

  async listRecent(limit: number): Promise<readonly TelemetryQuarantineRecord[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);
    const documents = await this.collection
      .find({})
      .sort({ receivedAt: -1 })
      .limit(boundedLimit)
      .toArray();

    return documents.map(toDomain);
  }
}
