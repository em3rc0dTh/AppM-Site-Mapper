'use client';

import Link from 'next/link';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';

export function AlarmScopeSummary({
  entityId,
  compact = false,
  showAffectedChildren = false,
}: {
  readonly entityId: string;
  readonly compact?: boolean;
  readonly showAffectedChildren?: boolean;
}) {
  const { snapshot, error } = useAlarmSnapshot();
  const rollup = snapshot.rollups[entityId];
  if (error) return <span className="sm-alarm-scope-unavailable">Alarm status unavailable</span>;
  if (!rollup?.activeAlarmCount) return null;

  if (compact) {
    return (
      <span
        className="sm-alarm-rollup-badge"
        data-severity={rollup.highestSeverity ?? 'INFO'}
        title={rollup.activeAlarmCount + ' active alarm(s) in this scope'}
      >
        {rollup.activeAlarmCount}
      </span>
    );
  }

  return (
    <section className="sm-alarm-scope-card" data-severity={rollup.highestSeverity ?? 'INFO'}>
      <header>
        <strong>{rollup.activeAlarmCount} active alarm{rollup.activeAlarmCount === 1 ? '' : 's'}</strong>
        <span>
          {rollup.critical} Critical · {rollup.warning} Warning · {rollup.info} Info
        </span>
      </header>
      <div className="sm-alarm-scope-meta">
        {rollup.directActiveAlarmCount > 0 ? (
          <span>{rollup.directActiveAlarmCount} direct</span>
        ) : (
          <span>Descendant roll-up · no telemetry ownership implied</span>
        )}
        <Link href="/alarms">View alarms →</Link>
      </div>
      {showAffectedChildren && rollup.affectedChildren.length > 0 ? (
        <div className="sm-alarm-affected-children">
          <small>AFFECTED CHILDREN</small>
          {rollup.affectedChildren.map((child) => (
            <Link href={child.href} key={child.id}>
              <span data-severity={child.highestSeverity}>●</span>
              <strong>{child.name}</strong>
              <em>{child.activeAlarmCount}</em>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AlarmOccurrenceList({
  entityId,
  descendants = true,
}: {
  readonly entityId: string;
  readonly descendants?: boolean;
}) {
  const { snapshot } = useAlarmSnapshot();
  const rollup = snapshot.rollups[entityId];
  if (!rollup?.activeAlarmCount) return null;
  const ids = descendants
    ? new Set([...rollup.directAlarmIds, ...rollup.descendantAlarmIds])
    : new Set(rollup.directAlarmIds);
  const alarms = snapshot.occurrences.filter(
    (item) => item.lifecycle === 'ACTIVE' && ids.has(item.id),
  );
  return (
    <div className="sm-alarm-occurrence-list">
      {alarms.map((alarm) => (
        <Link href={'/alarms/' + encodeURIComponent(alarm.id)} key={alarm.id}>
          <span data-severity={alarm.severity}>●</span>
          <div>
            <strong>{alarm.name}</strong>
            <small>{alarm.path.slice(-3).map((item) => item.name).join(' › ')}</small>
          </div>
          <em>{alarm.severity}</em>
        </Link>
      ))}
    </div>
  );
}
