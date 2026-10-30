'use client';

import Link from 'next/link';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';

export function AlarmHeaderBadge() {
  const { snapshot, loading, error } = useAlarmSnapshot();

  if (error) {
    return (
      <Link
        className="sm-alarm-header is-unavailable"
        href="/alarms"
        title="Alarm status unavailable"
      >
        <span aria-hidden="true">!</span>
        <span>ALARMS</span>
        <b>?</b>
      </Link>
    );
  }

  return (
    <Link
      className="sm-alarm-header"
      href="/alarms"
      data-severity={snapshot.global.highestSeverity ?? 'NONE'}
      aria-label={loading ? 'Loading alarms' : snapshot.global.activeAlarmCount + ' active alarms'}
    >
      <span aria-hidden="true">●</span>
      <span>ALARMS</span>
      <b>{loading ? '…' : snapshot.global.activeAlarmCount}</b>
      {!loading && snapshot.global.activeAlarmCount > 0 ? (
        <small>
          {snapshot.global.critical} C · {snapshot.global.warning} W · {snapshot.global.info} I
        </small>
      ) : null}
    </Link>
  );
}
