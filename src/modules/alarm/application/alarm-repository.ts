import type { AlarmOccurrence, AlarmTransition } from '@/modules/alarm/domain/entities';
import type {
  AlarmHistoryQuery,
  AlarmHistoryPage,
} from '@/modules/alarm/application/alarm-history';

export interface AlarmRepository {
  getOccurrence(id: string): Promise<AlarmOccurrence | null>;
  getActiveByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null>;
  getLatestByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null>;
  listActive(): Promise<readonly AlarmOccurrence[]>;
  listResolved(limit?: number): Promise<readonly AlarmOccurrence[]>;
  listHistory(query: AlarmHistoryQuery): Promise<AlarmHistoryPage>;
  insertOccurrence(occurrence: AlarmOccurrence): Promise<void>;
  replaceOccurrence(occurrence: AlarmOccurrence): Promise<void>;
  insertTransition(transition: AlarmTransition): Promise<void>;
  listTransitions(occurrenceId: string): Promise<readonly AlarmTransition[]>;
}
