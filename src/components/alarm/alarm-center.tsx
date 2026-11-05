'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useAlarmSnapshot } from '@/components/alarm/use-alarm-snapshot';
import { AlarmHistory } from '@/components/alarm/alarm-history';
import { compactAlarmPath } from '@/components/alarm/alarm-path';
import type {
  AlarmAcknowledgement,
  AlarmFamily,
  AlarmOccurrenceView,
  AlarmSeverity,
} from '@/modules/alarm/domain/entities';

const severityRank: Record<AlarmSeverity, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };

function scopeName(alarm: AlarmOccurrenceView, kind: string): string {
  return alarm.path.find((item) => item.kind === kind)?.name ?? '';
}

export function AlarmCenter() {
  const t = useTranslations('alarmUi.center');
  const { snapshot, loading, error, refresh } = useAlarmSnapshot(true);
  const [view, setView] = useState<'ACTIVE' | 'RESOLVED' | 'HISTORY'>('ACTIVE');
  const [severity, setSeverity] = useState<'ALL' | AlarmSeverity>('ALL');
  const [family, setFamily] = useState<'ALL' | AlarmFamily>('ALL');
  const [ack, setAck] = useState<'ALL' | AlarmAcknowledgement>('ALL');
  const [site, setSite] = useState('ALL');
  const [qdf, setQdf] = useState('ALL');
  const [search, setSearch] = useState('');

  const sites = useMemo(
    () =>
      [
        ...new Set(snapshot.occurrences.map((item) => scopeName(item, 'SITE')).filter(Boolean)),
      ].sort(),
    [snapshot.occurrences],
  );
  const qdfs = useMemo(
    () =>
      [
        ...new Set(
          snapshot.occurrences.map((item) => scopeName(item, 'CONTAINER_RACK')).filter(Boolean),
        ),
      ].sort(),
    [snapshot.occurrences],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return snapshot.occurrences
      .filter((item) => view === 'HISTORY' || item.lifecycle === view)
      .filter((item) => severity === 'ALL' || item.severity === severity)
      .filter((item) => family === 'ALL' || item.family === family)
      .filter((item) => ack === 'ALL' || item.acknowledgement === ack)
      .filter((item) => site === 'ALL' || scopeName(item, 'SITE') === site)
      .filter((item) => qdf === 'ALL' || scopeName(item, 'CONTAINER_RACK') === qdf)
      .filter((item) => {
        if (!needle) return true;
        return [
          item.name,
          item.alarmCode,
          item.sourceContext,
          item.targetId,
          item.path.map((pathItem) => pathItem.name).join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          b.openedAt.localeCompare(a.openedAt),
      );
  }, [ack, family, qdf, search, severity, site, snapshot.occurrences, view]);

  return (
    <section className="sm-alarm-center">
      <header className="sm-alarm-center-heading">
        <div>
          <span>{t('eyebrow')}</span>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </div>
        <button type="button" onClick={() => void refresh()}>
          {t('refresh')}
        </button>
      </header>

      {error ? (
        <div className="sm-alarm-unavailable" role="alert">
          {t('unavailable')}
        </div>
      ) : (
        <>
          <div className="sm-alarm-summary-grid">
            <article>
              <strong>{snapshot.global.activeAlarmCount}</strong>
              <span>{t('active')}</span>
            </article>
            <article data-severity="CRITICAL">
              <strong>{snapshot.global.critical}</strong>
              <span>{t('critical')}</span>
            </article>
            <article data-severity="WARNING">
              <strong>{snapshot.global.warning}</strong>
              <span>{t('warning')}</span>
            </article>
            <article data-severity="INFO">
              <strong>{snapshot.global.info}</strong>
              <span>{t('info')}</span>
            </article>
            <article>
              <strong>{snapshot.global.unacknowledgedCount}</strong>
              <span>{t('unacknowledged')}</span>
            </article>
          </div>

          <nav className="sm-alarm-view-tabs sm-alarm-main-tabs" aria-label={t('viewLabel')}>
            {(['ACTIVE', 'RESOLVED', 'HISTORY'] as const).map((tab) => (
              <button key={tab} type="button" aria-current={view === tab ? 'page' : undefined}
                aria-pressed={view === tab} onClick={() => setView(tab)}>
                {tab === 'ACTIVE' ? t('active') : tab === 'RESOLVED' ? t('resolved') : t('history')}
              </button>
            ))}
          </nav>
          {view === 'HISTORY' ? (
            <AlarmHistory />
          ) : (
            <>
          <div className="sm-alarm-filters">

            <select
              aria-label={t('severityLabel')}
              value={severity}
              onChange={(event) => setSeverity(event.target.value as 'ALL' | AlarmSeverity)}
            >
              <option value="ALL">{t('allSeverities')}</option>
              <option value="CRITICAL">{t('critical')}</option>
              <option value="WARNING">{t('warning')}</option>
              <option value="INFO">{t('info')}</option>
            </select>
            <select
              aria-label={t('siteLabel')}
              value={site}
              onChange={(event) => setSite(event.target.value)}
            >
              <option value="ALL">{t('allSites')}</option>
              {sites.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label={t('qdfLabel')}
              value={qdf}
              onChange={(event) => setQdf(event.target.value)}
            >
              <option value="ALL">{t('allQdfs')}</option>
              {qdfs.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label={t('familyLabel')}
              value={family}
              onChange={(event) => setFamily(event.target.value as 'ALL' | AlarmFamily)}
            >
              <option value="ALL">{t('allFamilies')}</option>
              <option value="COMMUNICATION">{t('communication')}</option>
              <option value="ELECTRICAL">{t('electrical')}</option>
              <option value="EQUIPMENT">{t('equipment')}</option>
              <option value="CORRELATED">{t('correlated')}</option>
            </select>
            <select
              aria-label={t('ackLabel')}
              value={ack}
              onChange={(event) => setAck(event.target.value as 'ALL' | AlarmAcknowledgement)}
            >
              <option value="ALL">{t('allAckStates')}</option>
              <option value="UNACKNOWLEDGED">{t('unacknowledged')}</option>
              <option value="ACKNOWLEDGED">{t('acknowledged')}</option>
            </select>
            <input
              aria-label={t('searchLabel')}
              type="search"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="sm-alarm-table-wrap">
            <table className="sm-alarm-table">
              <thead>
                <tr>
                  <th>{t('severityLabel')}</th>
                  <th>{t('alarm')}</th>
                  <th>{t('targetPath')}</th>
                  <th>{t('since')}</th>
                  <th>{t('status')}</th>
                  <th>{t('ack')}</th>
                  <th>{t('confidence')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((alarm) => (
                  <tr key={alarm.id} data-severity={alarm.severity}>
                    <td>
                      <span className="sm-alarm-severity">{alarm.severity}</span>
                    </td>
                    <td>
                      <strong>{alarm.name}</strong>
                      <small>{alarm.alarmCode}</small>
                    </td>
                    <td title={alarm.path.map((item) => item.name).join(' › ')}>
                      {compactAlarmPath(alarm.path)
                        .map((item) => item.name)
                        .join(' › ') || alarm.targetId}
                    </td>
                    <td>{new Date(alarm.openedAt).toLocaleString()}</td>
                    <td>{alarm.lifecycle}</td>
                    <td>{alarm.acknowledgement === 'ACKNOWLEDGED' ? 'ACK' : 'UNACK'}</td>
                    <td>{alarm.confidence ?? '—'}</td>
                    <td>
                      <Link href={'/alarms/' + encodeURIComponent(alarm.id)}>
                        {t('openDetail')}
                      </Link>
                      {' · '}
                      <Link href={alarm.targetHref}>{t('goToTarget')}</Link>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={8}>{t('empty')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
