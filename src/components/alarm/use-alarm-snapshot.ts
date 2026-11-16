'use client';

import { useSyncExternalStore } from 'react';

import type { AlarmSnapshot } from '@/modules/alarm/domain/entities';

const EMPTY: AlarmSnapshot = {
  occurrences: [],
  rollups: {},
  global: {
    directAlarmIds: [],
    descendantAlarmIds: [],
    directActiveAlarmCount: 0,
    descendantActiveAlarmCount: 0,
    activeAlarmCount: 0,
    critical: 0,
    warning: 0,
    info: 0,
    unacknowledgedCount: 0,
    highestSeverity: null,
    affectedChildren: [],
  },
};

interface AlarmSnapshotState {
  readonly snapshot: AlarmSnapshot;
  readonly loading: boolean;
  readonly error: string | null;
}

const INITIAL_STATE: AlarmSnapshotState = {
  snapshot: EMPTY,
  loading: true,
  error: null,
};

let state: AlarmSnapshotState = INITIAL_STATE;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: AlarmSnapshotState): void {
  state = next;
  for (const listener of listeners) listener();
}

async function refreshSharedSnapshot(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // All alarm surfaces consume the same snapshot, including resolved
      // occurrences. Rollups are still computed from ACTIVE occurrences only.
      const response = await fetch('/api/alarms?includeResolved=true', { cache: 'no-store' });
      if (!response.ok) throw new Error('ALARM_STATUS_UNAVAILABLE');
      emit({
        snapshot: (await response.json()) as AlarmSnapshot,
        loading: false,
        error: null,
      });
    } catch (reason) {
      emit({
        ...state,
        loading: false,
        error: reason instanceof Error ? reason.message : 'ALARM_STATUS_UNAVAILABLE',
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function startPolling(): void {
  if (timer) return;
  void refreshSharedSnapshot();
  timer = setInterval(() => void refreshSharedSnapshot(), 5_000);
}

function stopPolling(): void {
  if (listeners.size || !timer) return;
  clearInterval(timer);
  timer = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  startPolling();
  const refreshOnVisible = () => {
    if (document.visibilityState === 'visible') void refreshSharedSnapshot();
  };
  window.addEventListener('focus', refreshOnVisible);
  document.addEventListener('visibilitychange', refreshOnVisible);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('focus', refreshOnVisible);
    document.removeEventListener('visibilitychange', refreshOnVisible);
    stopPolling();
  };
}

function getSnapshot(): AlarmSnapshotState {
  return state;
}

function getServerSnapshot(): AlarmSnapshotState {
  return INITIAL_STATE;
}

/**
 * Alarm UI has one browser-side source of truth. The includeResolved argument is
 * retained for API compatibility; the shared store always fetches resolved
 * occurrences so the Alarm Center and scoped badges cannot drift by polling on
 * independent clocks.
 */
export function useAlarmSnapshot(_includeResolved = false) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...current,
    refresh: refreshSharedSnapshot,
  };
}
