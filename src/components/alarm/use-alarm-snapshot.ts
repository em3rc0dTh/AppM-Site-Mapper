'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function useAlarmSnapshot(includeResolved = false) {
  const [snapshot, setSnapshot] = useState<AlarmSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/alarms' + (includeResolved ? '?includeResolved=true' : ''),
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('ALARM_STATUS_UNAVAILABLE');
      setSnapshot((await response.json()) as AlarmSnapshot);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ALARM_STATUS_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }, [includeResolved]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
