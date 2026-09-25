import {
  type Collection,
  type Db,
  type Document,
  MongoServerError,
  type OptionalUnlessRequiredId,
} from 'mongodb';

import type {
  TelemetryAcceptanceRepository,
  TelemetryHistoryClaimOptions,
  TelemetryHistoryStats,
} from '@/modules/telemetry/application/telemetry-acceptance-repository';
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

function boundedLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 1000);
}

function requireTimestamp(name: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid ISO timestamp.`);
  }
  return parsed;
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
    const documents = await this.collection
      .find({ historyState: 'PENDING' })
      .sort({ acceptedAt: 1 })
      .limit(boundedLimit(limit))
      .toArray();

    return documents.map(toDomain);
  }

  async historyStats(now: string): Promise<TelemetryHistoryStats> {
    const nowMs = requireTimestamp('Telemetry history stats now', now);
    const unresolvedStates = ['PENDING', 'IN_FLIGHT', 'DEAD_LETTERED'] as const;
    const [pending, duePending, inFlight, expiredLeases, delivered, deadLettered, oldest] =
      await Promise.all([
        this.collection.countDocuments({ historyState: 'PENDING' }),
        this.collection.countDocuments({
          historyState: 'PENDING',
          $or: [
            { nextHistoryAttemptAt: { $exists: false } },
            { nextHistoryAttemptAt: { $lte: now } },
          ],
        }),
        this.collection.countDocuments({ historyState: 'IN_FLIGHT' }),
        this.collection.countDocuments({
          historyState: 'IN_FLIGHT',
          historyLeaseUntil: { $lte: now },
        }),
        this.collection.countDocuments({ historyState: 'DELIVERED' }),
        this.collection.countDocuments({ historyState: 'DEAD_LETTERED' }),
        this.collection.findOne(
          { historyState: { $in: [...unresolvedStates] } },
          {
            projection: { _id: 0, acceptedAt: 1 },
            sort: { acceptedAt: 1 },
          },
        ),
      ]);

    const oldestAcceptedAt =
      oldest && typeof oldest.acceptedAt === 'string' ? oldest.acceptedAt : undefined;
    const oldestMs =
      oldestAcceptedAt === undefined
        ? null
        : requireTimestamp('Telemetry acceptedAt', oldestAcceptedAt);

    return {
      generatedAt: now,
      pending,
      duePending,
      inFlight,
      expiredLeases,
      delivered,
      deadLettered,
      unresolved: pending + inFlight + deadLettered,
      ...(oldestAcceptedAt === undefined ? {} : { oldestUnresolvedAcceptedAt: oldestAcceptedAt }),
      ...(oldestMs === null
        ? {}
        : { oldestUnresolvedAgeSeconds: Math.max(0, Math.floor((nowMs - oldestMs) / 1000)) }),
    };
  }

  async claimPendingHistory(
    options: TelemetryHistoryClaimOptions,
  ): Promise<readonly TelemetryAcceptanceRecord[]> {
    if (!options.workerId.trim()) {
      throw new Error('Telemetry history workerId is required.');
    }

    if (!Number.isInteger(options.leaseSeconds) || options.leaseSeconds < 1) {
      throw new Error('Telemetry history leaseSeconds must be a positive integer.');
    }

    const nowMs = requireTimestamp('Telemetry history claim now', options.now);
    const leaseUntil = new Date(nowMs + options.leaseSeconds * 1000).toISOString();
    const claimed: TelemetryAcceptanceRecord[] = [];

    for (let index = 0; index < boundedLimit(options.limit); index += 1) {
      const document = await this.collection.findOneAndUpdate(
        {
          $or: [
            {
              historyState: 'PENDING',
              $or: [
                { nextHistoryAttemptAt: { $exists: false } },
                { nextHistoryAttemptAt: { $lte: options.now } },
              ],
            },
            {
              historyState: 'IN_FLIGHT',
              historyLeaseUntil: { $lte: options.now },
            },
          ],
        },
        {
          $set: {
            historyState: 'IN_FLIGHT',
            historyLeaseOwner: options.workerId,
            historyLeaseUntil: leaseUntil,
          },
          $unset: {
            nextHistoryAttemptAt: '',
          },
          $inc: {
            historyAttempts: 1,
          },
        },
        {
          sort: { acceptedAt: 1 },
          returnDocument: 'after',
        },
      );

      if (!document) break;
      claimed.push(toDomain(document));
    }

    return claimed;
  }

  async markHistoryDelivered(
    eventId: string,
    workerId: string,
    deliveredAt: string,
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      {
        eventId,
        historyState: 'IN_FLIGHT',
        historyLeaseOwner: workerId,
      },
      {
        $set: {
          historyState: 'DELIVERED',
          deliveredAt,
        },
        $unset: {
          historyLeaseOwner: '',
          historyLeaseUntil: '',
          nextHistoryAttemptAt: '',
          historyLastErrorCode: '',
          deadLetteredAt: '',
        },
      },
    );

    return result.modifiedCount === 1;
  }

  async markHistoryDeadLettered(
    eventId: string,
    workerId: string,
    deadLetteredAt: string,
    errorCode: string,
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      {
        eventId,
        historyState: 'IN_FLIGHT',
        historyLeaseOwner: workerId,
      },
      {
        $set: {
          historyState: 'DEAD_LETTERED',
          deadLetteredAt,
          historyLastErrorCode: errorCode,
        },
        $unset: {
          historyLeaseOwner: '',
          historyLeaseUntil: '',
          nextHistoryAttemptAt: '',
          deliveredAt: '',
        },
      },
    );

    return result.modifiedCount === 1;
  }

  async rescheduleHistory(
    eventId: string,
    workerId: string,
    nextAttemptAt: string,
    errorCode: string,
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      {
        eventId,
        historyState: 'IN_FLIGHT',
        historyLeaseOwner: workerId,
      },
      {
        $set: {
          historyState: 'PENDING',
          nextHistoryAttemptAt: nextAttemptAt,
          historyLastErrorCode: errorCode,
        },
        $unset: {
          historyLeaseOwner: '',
          historyLeaseUntil: '',
          deadLetteredAt: '',
        },
      },
    );

    return result.modifiedCount === 1;
  }
}
