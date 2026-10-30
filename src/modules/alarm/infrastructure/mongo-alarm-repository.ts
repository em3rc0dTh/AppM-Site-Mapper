import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type { AlarmOccurrence, AlarmTransition } from '@/modules/alarm/domain/entities';

type OccurrenceDocument = AlarmOccurrence & Document;
type TransitionDocument = AlarmTransition & Document;

function withoutMongoId<T>(document: T & Document): T {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as T;
}

export class MongoAlarmRepository implements AlarmRepository {
  private readonly occurrences: Collection<OccurrenceDocument>;
  private readonly transitions: Collection<TransitionDocument>;

  constructor(database: Db) {
    this.occurrences = database.collection<OccurrenceDocument>('alarm_occurrences');
    this.transitions = database.collection<TransitionDocument>('alarm_transitions');
  }

  async getOccurrence(id: string): Promise<AlarmOccurrence | null> {
    const document = await this.occurrences.findOne({ id });
    return document ? withoutMongoId<AlarmOccurrence>(document) : null;
  }

  async getActiveByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null> {
    const document = await this.occurrences.findOne({ correlationKey, lifecycle: 'ACTIVE' });
    return document ? withoutMongoId<AlarmOccurrence>(document) : null;
  }

  async listActive(): Promise<readonly AlarmOccurrence[]> {
    return (
      await this.occurrences.find({ lifecycle: 'ACTIVE' }).sort({ openedAt: -1 }).toArray()
    ).map((item) => withoutMongoId<AlarmOccurrence>(item));
  }

  async listResolved(limit = 100): Promise<readonly AlarmOccurrence[]> {
    return (
      await this.occurrences
        .find({ lifecycle: 'RESOLVED' })
        .sort({ resolvedAt: -1 })
        .limit(Math.max(1, Math.min(limit, 500)))
        .toArray()
    ).map((item) => withoutMongoId<AlarmOccurrence>(item));
  }

  async insertOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    await this.occurrences.insertOne(occurrence as OptionalUnlessRequiredId<OccurrenceDocument>);
  }

  async replaceOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    const result = await this.occurrences.replaceOne({ id: occurrence.id }, occurrence);
    if (result.matchedCount !== 1) throw new Error('ALARM_OCCURRENCE_NOT_FOUND');
  }

  async insertTransition(transition: AlarmTransition): Promise<void> {
    await this.transitions.insertOne(transition as OptionalUnlessRequiredId<TransitionDocument>);
  }

  async listTransitions(occurrenceId: string): Promise<readonly AlarmTransition[]> {
    return (
      await this.transitions
        .find({ alarmOccurrenceId: occurrenceId })
        .sort({ occurredAt: 1 })
        .toArray()
    ).map((item) => withoutMongoId<AlarmTransition>(item));
  }
}
