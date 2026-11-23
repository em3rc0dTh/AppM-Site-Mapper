'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { TrapView } from '@/modules/telemetry/domain/industrial/trap-view';
import styles from './snmp-trap-panel.module.css';

type TrapResponse = {
  events: TrapView[];
  nextCursor: string | null;
  sourceConfigured: boolean;
};

function localTime(value: string, locale: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(milliseconds);
}

function plainValue(value: string): string {
  return value || '—';
}

export function SnmpTrapPanel({
  deviceId,
  deviceName,
}: Readonly<{ deviceId: string; deviceName: string }>) {
  const t = useTranslations('snmpTraps');
  const locale = useLocale();
  const [events, setEvents] = useState<TrapView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [sourceConfigured, setSourceConfigured] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    async function refresh() {
      try {
        const response = await fetch(
          '/api/telemetry/industrial/traps?' + new URLSearchParams({ deviceId }),
          { cache: 'no-store', signal: abort.signal },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = (await response.json()) as TrapResponse;
        if (!Array.isArray(data.events)) throw new Error('INVALID_TRAPS_RESPONSE');
        if (abort.signal.aborted) return;
        setEvents(data.events);
        setNextCursor(data.nextCursor ?? null);
        setSourceConfigured(data.sourceConfigured);
        setError('');
        setLoading(false);
      } catch (cause) {
        if (abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : t('error'));
        setLoading(false);
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    return () => {
      abort.abort();
      clearInterval(interval);
    };
  }, [deviceId, t]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(
        '/api/telemetry/industrial/traps?' +
          new URLSearchParams({ deviceId, cursor: nextCursor }),
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = (await response.json()) as TrapResponse;
      if (!Array.isArray(data.events)) throw new Error('INVALID_TRAPS_RESPONSE');
      setEvents((current) => {
        const keys = new Set(current.map((event) => event.id));
        return [...current, ...data.events.filter((event) => !keys.has(event.id))];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'));
    } finally {
      setLoadingOlder(false);
    }
  }

  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;
  const stateLabel = (state: TrapView['alarmState']) =>
    state === 'ACTIVE' ? t('active') : state === 'RESOLVED' ? t('resolved') : t('unclassified');
  const severityLabel = (severity: string | null) => {
    if (!severity) return t('unclassified');
    const value = severity.toLowerCase();
    if (value.includes('critical') || value === 'major') return t('critical');
    if (value.includes('warning') || value === 'minor') return t('warning');
    return severity;
  };

  function exportSelected() {
    if (!selected) return;
    const data = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'snmp-trap-' + selected.id + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copySelected() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
      setNotice(t('copied'));
    } catch {
      setNotice(t('copyFailed'));
    }
  }

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <header className={styles.panelHeader}>
        <h3><span className={styles.liveDot} aria-hidden="true" />{t('title')}</h3>
        <span className={styles.liveBadge} data-state={error ? 'error' : 'ready'}>
          <span className={styles.liveDot} aria-hidden="true" />
          {error ? t('unavailable') : t('live')}
        </span>
      </header>

      {error && <p className={styles.alert} role="alert">{t('error')}: {error}</p>}
      {loading && <p className={styles.empty} role="status">{t('loading')}</p>}
      {!loading && sourceConfigured === false && (
        <p className={styles.empty} role="status">{t('noSource')}</p>
      )}
      {!loading && sourceConfigured && events.length === 0 && (
        <p className={styles.empty} role="status">{t('empty')}</p>
      )}

      {events.length > 0 && (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('time')}</th>
                  <th>{t('source')}</th>
                  <th>{t('notification')}</th>
                  <th>{t('oid')}</th>
                  <th>{t('severity')}</th>
                  <th>{t('state')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} data-selected={event.id === selected?.id}>
                    <td>
                      <button
                        className={styles.selectEvent}
                        type="button"
                        onClick={() => { setSelectedId(event.id); setNotice(''); }}
                        aria-label={t('inspect', { time: localTime(event.receivedAt, locale) })}
                        aria-pressed={event.id === selected?.id}
                      >
                        <time dateTime={event.receivedAt}>{localTime(event.receivedAt, locale)}</time>
                      </button>
                    </td>
                    <td className={styles.sourceCell}>
                      <strong title={event.sourceIdentity}>{event.sourceIdentity}</strong>
                      <small>{deviceName}</small>
                    </td>
                    <td><span title={event.notificationName ?? event.notificationOid ?? ''}>
                      {event.notificationName ?? event.notificationOid ?? '—'}
                    </span></td>
                    <td className={styles.oidCell} title={event.notificationOid ?? undefined}>
                      {event.notificationOid ?? '—'}
                    </td>
                    <td>
                      <span className={styles.chip} data-severity={event.severity ?? 'none'}>
                        {severityLabel(event.severity)}
                      </span>
                    </td>
                    <td>
                      <span className={styles.chip} data-state={event.alarmState ?? 'none'}>
                        {stateLabel(event.alarmState)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className={styles.pagination}>
              <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>
                {loadingOlder ? t('loading') : t('older')}
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <section className={styles.detail} aria-label={t('detail')}>
          <header className={styles.detailHeader}>
            <div className={styles.detailIdentity}>
              <span className={styles.bell} aria-hidden="true">♧</span>
              <div>
                <h4>{t('detail')}</h4>
                <small>{selected.notificationName ?? selected.notificationOid ?? '—'} · {selected.sourceIdentity}</small>
              </div>
            </div>
            <div className={styles.detailBadges}>
              <time dateTime={selected.receivedAt}>{localTime(selected.receivedAt, locale)}</time>
              <span className={styles.chip} data-severity={selected.severity ?? 'none'}>
                {severityLabel(selected.severity)}
              </span>
              <span className={styles.chip} data-state={selected.alarmState ?? 'none'}>
                {stateLabel(selected.alarmState)}
              </span>
            </div>
          </header>
          <div className={styles.detailGrid}>
            <div className={styles.detailColumn}>
              <h5>{t('varbinds')}</h5>
              <div className={styles.varbindBox}>
                {selected.varbinds.length === 0 ? (
                  <p>{t('noVarbinds')}</p>
                ) : (
                  <dl className={styles.varbindList}>
                    {selected.varbinds.map((item, index) => (
                      <div key={item.oid + ':' + index}>
                        <dt title={item.oid}>{item.name ?? item.oid}</dt>
                        <dd title={item.type}>{plainValue(item.value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {selected.varbindCount > selected.varbinds.length && (
                  <small>{t('limited', { count: selected.varbindCount })}</small>
                )}
              </div>
            </div>
            <div className={styles.detailColumn}>
              <h5>{t('context')}</h5>
              <div className={styles.contextIntro}>{t('contextHelp')}</div>
              <dl className={styles.contextList}>
                <div><dt>{t('origin')}</dt><dd>{selected.sourceIdentity}</dd></div>
                <div><dt>{t('device')}</dt><dd>{deviceName}</dd></div>
                <div><dt>{t('notificationOid')}</dt><dd><code>{selected.notificationOid ?? '—'}</code></dd></div>
                <div><dt>{t('type')}</dt><dd>{selected.transport.toUpperCase()}</dd></div>
                <div><dt>{t('alarmCorrelation')}</dt><dd>{selected.alarmCode ?? t('unverified')}</dd></div>
              </dl>
              <div className={styles.actions}>
                <Link href="/alarms">{t('seeAlarms')}</Link>
                <button type="button" onClick={() => void copySelected()}>{t('copy')}</button>
                <button type="button" onClick={exportSelected}>{t('export')}</button>
              </div>
              {notice && <p role="status" className={styles.notice}>{notice}</p>}
            </div>
          </div>
        </section>
      )}
    </section>
  );
}
