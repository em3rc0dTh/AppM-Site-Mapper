'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { compactAlarmPath } from '@/components/alarm/alarm-path';
import type { AlarmOccurrenceView } from '@/modules/alarm/domain/entities';

type Page = { readonly items: readonly AlarmOccurrenceView[]; readonly nextCursor: string | null };
const DEFAULT_PAGE: Page = { items: [], nextCursor: null };

export function AlarmHistory() {
  const t = useTranslations('alarmUi.center');
  const [lifecycle, setLifecycle] = useState('');
  const [ack, setAck] = useState('');
  const [severity, setSeverity] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [targetId, setTargetId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorTrail, setCursorTrail] = useState<readonly (string | null)[]>([]);
  const [page, setPage] = useState<Page>(DEFAULT_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const filters = useMemo(() => {
    const query = new URLSearchParams({ limit: '50' });
    if (lifecycle) query.set('lifecycle', lifecycle);
    if (ack) query.set('ack', ack);
    if (severity) query.set('severity', severity);
    if (fromDate) query.set('fromDate', fromDate);
    if (toDate) query.set('toDate', toDate);
    if (targetId.trim()) query.set('targetId', targetId.trim());
    return query.toString();
  }, [lifecycle, ack, severity, fromDate, toDate, targetId]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          '/api/alarms/history?' +
            filters +
            (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error('ALARM_HISTORY_UNAVAILABLE');
        const result = (await response.json()) as Page;
        if (!controller.signal.aborted) {
          setPage(result);
          setError('');
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setPage(DEFAULT_PAGE);
          setError(reason instanceof Error ? reason.message : 'ALARM_HISTORY_UNAVAILABLE');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [filters, cursor, reload]);

  const update = (callback: () => void) => {
    setLoading(true);
    setCursor(null);
    setCursorTrail([]);
    callback();
  };
  return (
    <section className="sm-alarm-history" aria-label={t('history')}>
      <header className="sm-alarm-history-heading">
        <div>
          <h2>{t('history')}</h2>
          <p>{t('historyDescription')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReload((n) => n + 1);
          }}
        >
          {t('refresh')}
        </button>
      </header>
      <div className="sm-alarm-filters">
        <select
          aria-label={t('status')}
          value={lifecycle}
          onChange={(e) => update(() => setLifecycle(e.target.value))}
        >
          <option value="">{t('allStatuses')}</option>
          <option value="ACTIVE">{t('active')}</option>
          <option value="RESOLVED">{t('resolved')}</option>
        </select>
        <select
          aria-label={t('ackLabel')}
          value={ack}
          onChange={(e) => update(() => setAck(e.target.value))}
        >
          <option value="">{t('allAckStates')}</option>
          <option value="ACKNOWLEDGED">{t('acknowledged')}</option>
          <option value="UNACKNOWLEDGED">{t('unacknowledged')}</option>
        </select>
        <select
          aria-label={t('severityLabel')}
          value={severity}
          onChange={(e) => update(() => setSeverity(e.target.value))}
        >
          <option value="">{t('allSeverities')}</option>
          <option value="CRITICAL">{t('critical')}</option>
          <option value="WARNING">{t('warning')}</option>
          <option value="INFO">{t('info')}</option>
        </select>
        <label className="sm-alarm-date-filter">
          <span>{t('fromDate')}</span>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => update(() => setFromDate(e.target.value))}
          />
        </label>
        <label className="sm-alarm-date-filter">
          <span>{t('toDate')}</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => update(() => setToDate(e.target.value))}
          />
        </label>
        <input
          aria-label={t('targetIdLabel')}
          placeholder={t('targetIdLabel')}
          value={targetId}
          onChange={(e) => update(() => setTargetId(e.target.value))}
        />
      </div>
      {error ? (
        <div className="sm-alarm-unavailable" role="alert">
          {error}
        </div>
      ) : null}
      <div className="sm-alarm-table-wrap" aria-busy={loading}>
        <table className="sm-alarm-table">
          <thead>
            <tr>
              <th>{t('severityLabel')}</th>
              <th>{t('alarm')}</th>
              <th>{t('targetPath')}</th>
              <th>{t('since')}</th>
              <th>{t('status')}</th>
              <th>{t('ack')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((item) => (
              <tr key={item.id} data-severity={item.severity}>
                <td>
                  <span className="sm-alarm-severity">{item.severity}</span>
                </td>
                <td>
                  <strong>{item.name}</strong>
                  <small>{item.alarmCode}</small>
                </td>
                <td title={item.path.map((x) => x.name).join(' › ')}>
                  {compactAlarmPath(item.path)
                    .map((x) => x.name)
                    .join(' › ') || item.targetId}
                </td>
                <td>{new Date(item.openedAt).toLocaleString()}</td>
                <td>{item.lifecycle}</td>
                <td>{item.acknowledgement === 'ACKNOWLEDGED' ? 'ACK' : 'UNACK'}</td>
                <td>
                  <Link href={'/alarms/' + encodeURIComponent(item.id)}>{t('openDetail')}</Link>
                </td>
              </tr>
            ))}
            {!loading && !page.items.length && !error ? (
              <tr>
                <td colSpan={7}>{t('empty')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <footer className="sm-alarm-history-pagination">
        <span>{t('pageSizeNote')}</span>
        <button
          type="button"
          disabled={loading || !cursor}
          onClick={() => {
            setLoading(true);
            setCursor(null);
            setCursorTrail([]);
          }}
        >
          {t('firstPage')}
        </button>
        <button
          type="button"
          disabled={loading || !cursorTrail.length}
          onClick={() => {
            setLoading(true);
            setCursor(cursorTrail[cursorTrail.length - 1] ?? null);
            setCursorTrail((trail) => trail.slice(0, -1));
          }}
        >
          {t('previousPage')}
        </button>
        <button
          type="button"
          disabled={loading || !page.nextCursor}
          onClick={() => {
            setLoading(true);
            setCursorTrail((trail) => [...trail, cursor]);
            setCursor(page.nextCursor);
          }}
        >
          {t('nextPage')}
        </button>
      </footer>
    </section>
  );
}
