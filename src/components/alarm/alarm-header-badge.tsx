'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';

export function AlarmHeaderBadge() {
  const t = useTranslations('alarmUi.header');
  const { snapshot, loading, error } = useAlarmSnapshot();

  if (error) {
    return (
      <Link className="sm-alarm-header is-unavailable" href="/alarms" title={t('unavailable')}>
        <span aria-hidden="true">!</span>
        <span>{t('title')}</span>
        <b>?</b>
      </Link>
    );
  }

  return (
    <Link
      className="sm-alarm-header"
      href="/alarms"
      data-severity={snapshot.global.highestSeverity ?? 'NONE'}
      aria-label={
        loading ? t('loadingLabel') : t('activeLabel', { count: snapshot.global.activeAlarmCount })
      }
    >
      <span aria-hidden="true">●</span>
      <span>{t('title')}</span>
      <b>{loading ? '…' : snapshot.global.activeAlarmCount}</b>
      {!loading && snapshot.global.activeAlarmCount > 0 ? (
        <small>
          {t('summary', {
            critical: snapshot.global.critical,
            warning: snapshot.global.warning,
            info: snapshot.global.info,
          })}
        </small>
      ) : null}
    </Link>
  );
}
