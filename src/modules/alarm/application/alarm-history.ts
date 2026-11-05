import type { AlarmAcknowledgement, AlarmLifecycle, AlarmOccurrence, AlarmSeverity } from '@/modules/alarm/domain/entities';

export interface AlarmHistoryQuery {
  readonly limit: number;
  readonly cursor?: string;
  readonly lifecycle?: AlarmLifecycle;
  readonly acknowledgement?: AlarmAcknowledgement;
  readonly severity?: AlarmSeverity;
  readonly targetId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
}

export interface AlarmHistoryPage {
  readonly items: readonly AlarmOccurrence[];
  readonly nextCursor: string | null;
}

export function parseHistoryCursor(cursor: string): { openedAt: string; id: string } {
  const split = cursor.indexOf('|');
  if (split < 0 || split > 35 || cursor.length > 256) throw new Error('INVALID_HISTORY_CURSOR');
  const openedAt = cursor.slice(0, split);
  const id = cursor.slice(split + 1);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(openedAt) ||
      !Number.isFinite(Date.parse(openedAt)) || !id || id.includes('|')) {
    throw new Error('INVALID_HISTORY_CURSOR');
  }
  return { openedAt, id };
}

export function compareHistoryOrder(a: AlarmOccurrence, b: AlarmOccurrence): number {
  return b.openedAt.localeCompare(a.openedAt) || b.id.localeCompare(a.id);
}

export function takeHistoryPage(items: readonly AlarmOccurrence[], limit: number): AlarmHistoryPage {
  const page = items.slice(0, limit);
  return {
    items: page,
    nextCursor: items.length > limit && page.length
      ? page[page.length - 1]!.openedAt + '|' + page[page.length - 1]!.id
      : null,
  };
}
