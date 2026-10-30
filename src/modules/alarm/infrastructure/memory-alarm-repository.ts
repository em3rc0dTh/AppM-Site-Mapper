import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
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

  async insertOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    if (this.occurrences.has(occurrence.id)) throw new Error('ALARM_OCCURRENCE_EXISTS');
    this.occurrences.set(occurrence.id, occurrence);
  }

  async replaceOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    if (!this.occurrences.has(occurrence.id)) throw new Error('ALARM_OCCURRENCE_NOT_FOUND');
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
