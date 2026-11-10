import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { TelemetryWatchRepository } from '@/modules/telemetry/application/telemetry-watch-repository';
import type {
  TelemetryWatchExpectation,
  TelemetryWatchObservation,
  TelemetryWatchState,
} from '@/modules/telemetry/domain/telemetry-watch';
import { telemetryWatchId } from '@/modules/telemetry/domain/telemetry-watch';

type WatchDocument = TelemetryWatchState & Document;

function toDomain(document: WatchDocument): TelemetryWatchState {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as TelemetryWatchState;
}

export class MongoTelemetryWatchRepository implements TelemetryWatchRepository {
  private readonly collection: Collection<WatchDocument>;

  constructor(database: Db) {
    this.collection = database.collection<WatchDocument>('telemetry_watch_state');
  }

  async ensureExpected(
    expectation: TelemetryWatchExpectation,
    firstExpectedAt = new Date().toISOString(),
  ): Promise<TelemetryWatchState> {
    const id = telemetryWatchId(expectation);
    const existing = await this.collection.findOne({ id });
    if (existing) return toDomain(existing);

    const state: TelemetryWatchState = {
      id,
      ...expectation,
      firstExpectedAt,
      freshStreak: 0,
      reportedOfflineStreak: 0,
      createdAt: firstExpectedAt,
      updatedAt: firstExpectedAt,
    };
    try {
      await this.collection.insertOne(state as OptionalUnlessRequiredId<WatchDocument>);
      return state;
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        (error as { code?: unknown }).code !== 11000
      ) {
        throw error;
      }
      const winner = await this.collection.findOne({ id });
      if (!winner) throw error;
      return toDomain(winner);
    }
  }

  async observe(observation: TelemetryWatchObservation): Promise<TelemetryWatchState> {
    const current = await this.ensureExpected(observation, observation.observedAt);
    if (current.lastObservedAt && observation.observedAt <= current.lastObservedAt) return current;

    const next: TelemetryWatchState = {
      ...current,
      lastObservedAt: observation.observedAt,
      ...(observation.usable ? { lastUsableAt: observation.observedAt } : {}),
      ...(observation.reportedState ? { lastReportedState: observation.reportedState } : {}),
      freshStreak: observation.usable ? current.freshStreak + 1 : 0,
      reportedOfflineStreak: observation.usable ? 0 : current.reportedOfflineStreak + 1,
      updatedAt: observation.observedAt,
    };
    await this.collection.replaceOne(
      {
        id: current.id,
        updatedAt: current.updatedAt,
      },
      next as WatchDocument,
    );
    const stored = await this.collection.findOne({ id: current.id });
    return stored ? toDomain(stored) : next;
  }

  async markLost(
    expectation: TelemetryWatchExpectation,
    detectedAt = new Date().toISOString(),
  ): Promise<TelemetryWatchState> {
    const current = await this.ensureExpected(expectation, detectedAt);
    if (current.freshStreak === 0) return current;
    await this.collection.updateOne(
      { id: current.id },
      { $set: { freshStreak: 0, updatedAt: detectedAt } },
    );
    const stored = await this.collection.findOne({ id: current.id });
    return stored ? toDomain(stored) : { ...current, freshStreak: 0, updatedAt: detectedAt };
  }

  async list(): Promise<readonly TelemetryWatchState[]> {
    return (await this.collection.find({}).toArray()).map(toDomain);
  }
}
