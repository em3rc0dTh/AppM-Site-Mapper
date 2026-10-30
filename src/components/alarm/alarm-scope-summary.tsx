'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('alarmUi.scope');
  const { snapshot, error } = useAlarmSnapshot();
  const rollup = snapshot.rollups[entityId];
  if (error) return <span className="sm-alarm-scope-unavailable">{t('unavailable')}</span>;
  if (!rollup?.activeAlarmCount) return null;

  if (compact) {
    return (
      <span
        className="sm-alarm-rollup-badge"
        data-severity={rollup.highestSeverity ?? 'INFO'}
        title={t('activeInScope', { count: rollup.activeAlarmCount })}
      >
        {rollup.activeAlarmCount}
      </span>
    );
  }

  return (
    <section className="sm-alarm-scope-card" data-severity={rollup.highestSeverity ?? 'INFO'}>
      <header>
        <strong>
          {t('activeCount', { count: rollup.activeAlarmCount })}
        </strong>
        <span>
          {t('severityCounts', { critical: rollup.critical, warning: rollup.warning, info: rollup.info })}
        </span>
      </header>
      <div className="sm-alarm-scope-meta">
        {rollup.directActiveAlarmCount > 0 ? (
          <span>{t('direct', { count: rollup.directActiveAlarmCount })}</span>
        ) : (
          <span>{t('rollup')}</span>
        )}
        <Link href="/alarms">{t('view')}</Link>
      </div>
      {showAffectedChildren && rollup.affectedChildren.length > 0 ? (
        <div className="sm-alarm-affected-children">
          <small>{t('affectedChildren')}</small>
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
            <small>
              {alarm.path
                .slice(-3)
                .map((item) => item.name)
                .join(' › ')}
            </small>
          </div>
          <em>{alarm.severity}</em>
        </Link>
      ))}
    </div>
  );
}
