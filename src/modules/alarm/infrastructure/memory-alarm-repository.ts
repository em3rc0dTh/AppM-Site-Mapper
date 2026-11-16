import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import {
  compareHistoryOrder,
  parseHistoryCursor,
  takeHistoryPage,
} from '@/modules/alarm/application/alarm-history';
import type {
  AlarmHistoryPage,
  AlarmHistoryQuery,
} from '@/modules/alarm/application/alarm-history';
import type { AlarmOccurrence, AlarmTransition } from '@/modules/alarm/domain/entities';

export class MemoryAlarmRepository implements AlarmRepository {
  private readonly occurrences = new Map<string, AlarmOccurrence>();
  private readonly transitions: AlarmTransition[] = [];

  async getOccurrence(id: string): Promise<AlarmOccurrence | null> {
    return this.occurrences.get(id) ?? null;
  }

  async getActiveByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null> {
    return (
      [...this.occurrences.values()].find(
        (item) => item.lifecycle === 'ACTIVE' && item.correlationKey === correlationKey,
      ) ?? null
    );
  }

  async getLatestByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null> {
    return (
      [...this.occurrences.values()]
        .filter((item) => item.correlationKey === correlationKey)
        .sort(
          (a, b) =>
            b.lastObservedAt.localeCompare(a.lastObservedAt) ||
            b.openedAt.localeCompare(a.openedAt),
        )[0] ?? null
    );
  }

  async listActive(): Promise<readonly AlarmOccurrence[]> {
    return [...this.occurrences.values()]
      .filter((item) => item.lifecycle === 'ACTIVE')
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  async listResolved(limit = 100): Promise<readonly AlarmOccurrence[]> {
    return [...this.occurrences.values()]
      .filter((item) => item.lifecycle === 'RESOLVED')
      .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
      .slice(0, limit);
  }

  async listHistory(query: AlarmHistoryQuery): Promise<AlarmHistoryPage> {
    const previous = query.cursor ? parseHistoryCursor(query.cursor) : null;
    const ordered = [...this.occurrences.values()]
      .filter((item) => !query.lifecycle || item.lifecycle === query.lifecycle)
      .filter((item) => !query.acknowledgement || item.acknowledgement === query.acknowledgement)
      .filter((item) => !query.severity || item.severity === query.severity)
      .filter((item) => !query.targetId || item.targetId === query.targetId)
      .filter((item) => !query.fromDate || item.openedAt.slice(0, 10) >= query.fromDate)
      .filter((item) => !query.toDate || item.openedAt.slice(0, 10) <= query.toDate)
      .filter(
        (item) =>
          !previous ||
          item.openedAt < previous.openedAt ||
          (item.openedAt === previous.openedAt && item.id < previous.id),
      )
      .sort(compareHistoryOrder);
    return takeHistoryPage(ordered, query.limit);
  }

  async insertOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    if (this.occurrences.has(occurrence.id)) throw new Error('ALARM_OCCURRENCE_EXISTS');
    if (
      occurrence.lifecycle === 'ACTIVE' &&
      [...this.occurrences.values()].some(
        (item) => item.lifecycle === 'ACTIVE' && item.correlationKey === occurrence.correlationKey,
      )
    ) {
      throw new Error('ALARM_ACTIVE_CORRELATION_EXISTS');
    }
    this.occurrences.set(occurrence.id, occurrence);
  }

  async replaceOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    const current = this.occurrences.get(occurrence.id);
    if (!current) throw new Error('ALARM_OCCURRENCE_NOT_FOUND');
    if (
      (current.lifecycle === 'RESOLVED' && occurrence.lifecycle === 'ACTIVE') ||
      occurrence.lastObservedAt < current.lastObservedAt
    ) {
      throw new Error('ALARM_STALE_WRITE');
    }
    this.occurrences.set(occurrence.id, occurrence);
  }

  async insertTransition(transition: AlarmTransition): Promise<void> {
    this.transitions.push(transition);
  }

  async listTransitions(occurrenceId: string): Promise<readonly AlarmTransition[]> {
    return this.transitions
      .filter((item) => item.alarmOccurrenceId === occurrenceId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
}
