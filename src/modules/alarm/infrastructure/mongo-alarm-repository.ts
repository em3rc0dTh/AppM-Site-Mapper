import type { Collection, Db, Document, Filter, OptionalUnlessRequiredId } from 'mongodb';

import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import { parseHistoryCursor, takeHistoryPage } from '@/modules/alarm/application/alarm-history';
import type { AlarmHistoryPage, AlarmHistoryQuery } from '@/modules/alarm/application/alarm-history';
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

  async getLatestByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null> {
    const document = await this.occurrences.findOne(
      { correlationKey },
      { sort: { lastObservedAt: -1, openedAt: -1 } },
    );
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

  async listHistory(query: AlarmHistoryQuery): Promise<AlarmHistoryPage> {
    const filter: Filter<OccurrenceDocument> = {};
    if (query.lifecycle) filter.lifecycle = query.lifecycle;
    if (query.acknowledgement) filter.acknowledgement = query.acknowledgement;
    if (query.severity) filter.severity = query.severity;
    if (query.targetId) filter.targetId = query.targetId;
    if (query.fromDate || query.toDate) {
      filter.openedAt = {
        ...(query.fromDate ? { $gte: query.fromDate + 'T00:00:00.000Z' } : {}),
        ...(query.toDate ? { $lte: query.toDate + 'T23:59:59.999Z' } : {}),
      };
    }
    if (query.cursor) {
      const previous = parseHistoryCursor(query.cursor);
      filter.$or = [
        { openedAt: { $lt: previous.openedAt } },
        { openedAt: previous.openedAt, id: { $lt: previous.id } },
      ];
    }
    const documents = await this.occurrences.find(filter).sort({ openedAt: -1, id: -1 })
      .limit(query.limit + 1).toArray();
    return takeHistoryPage(
      documents.map((item) => withoutMongoId<AlarmOccurrence>(item)),
      query.limit,
    );
  }

  async insertOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    await this.occurrences.insertOne(occurrence as OptionalUnlessRequiredId<OccurrenceDocument>);
  }

  async replaceOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    const result = await this.occurrences.replaceOne(
      {
        id: occurrence.id,
        ...(occurrence.lifecycle === 'ACTIVE' ? { lifecycle: 'ACTIVE' } : {}),
        lastObservedAt: { $lte: occurrence.lastObservedAt },
      },
      occurrence,
    );
    if (result.matchedCount === 1) return;

    const current = await this.occurrences.findOne({ id: occurrence.id });
    if (!current) throw new Error('ALARM_OCCURRENCE_NOT_FOUND');
    throw new Error('ALARM_STALE_WRITE');
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
