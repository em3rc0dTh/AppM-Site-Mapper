'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { TrapView } from '@/modules/telemetry/domain/industrial/trap-view';
import styles from './snmp-trap-panel.module.css';

type TrapResponse = {
  events: TrapView[];
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

function varbind(event: TrapView, name: string) {
  return event.varbinds.find((item) => item.name === name);
}

export function SnmpTrapPanel({
  deviceId,
  deviceName,
}: Readonly<{ deviceId: string; deviceName: string }>) {
  const t = useTranslations('snmpTraps');
  const locale = useLocale();
  const enumT = useTranslations('snmpEnums');
  const localizedEnum = (value: string): string => {
    if (!locale.toLowerCase().startsWith('es')) return value;
    switch (value) {
      case 'normal':
        return enumT('normal');
      case 'minorAlarm':
        return enumT('minorAlarm');
      case 'majorAlarm':
        return enumT('majorAlarm');
      case 'critical':
        return enumT('critical');
      case 'warning':
        return enumT('warning');
      case 'error':
        return enumT('error');
      case 'disabled':
        return enumT('disabled');
      case 'disconnected':
        return enumT('disconnected');
      case 'notPresent':
        return enumT('notPresent');
      case 'off':
        return enumT('off');
      case 'on':
        return enumT('on');
      default:
        return value;
    }
  };
  const decodeValue = (item: TrapView['varbinds'][number]): string => {
    let rendered = item.value || '—';
    try {
      const decoded = JSON.parse(item.value) as { encoding?: string; bytes?: string };
      if (decoded?.encoding === 'base64' && typeof decoded.bytes === 'string') {
        const bytes = Uint8Array.from(atob(decoded.bytes), (character) => character.charCodeAt(0));
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          rendered = /[\x00-\x1f\x7f]/.test(text)
            ? enumT('binaryBytes', { count: bytes.length })
            : text.trim();
        } catch {
          rendered = enumT('binaryBytes', { count: bytes.length });
        }
      }
    } catch {
      // Plain scalar.
    }
    if (item.enumLabel) return `${localizedEnum(item.enumLabel)} (${rendered})`;
    if (item.referencedName) return `${item.referencedName} · ${rendered}`;
    return rendered;
  };
  const [events, setEvents] = useState<TrapView[]>([]);
  const [sourceConfigured, setSourceConfigured] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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
        const latest = data.events.slice(0, 10);
        setEvents(latest);
        setSourceConfigured(data.sourceConfigured);
        setSelectedId((current) =>
          current && latest.some((event) => event.id === current) ? current : null,
        );
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

  const selected = events.find((event) => event.id === selectedId) ?? null;
  const stateLabel = (state: TrapView['alarmState']) =>
    state === 'ACTIVE' ? t('active') : state === 'RESOLVED' ? t('resolved') : t('unclassified');
  const severityLabel = (severity: string | null) => {
    if (!severity) return t('unclassified');
    const value = severity.toLowerCase();
    if (value.includes('critical') || value.includes('major')) return t('critical');
    if (value.includes('warning') || value.includes('minor')) return t('warning');
    return severity;
  };

  const sourceDescr = selected ? varbind(selected, 'alarmSubsysSourceDescr') : undefined;
  const condition = selected ? varbind(selected, 'alarmSubsysStatusValue') : undefined;
  const measuredOid = selected ? varbind(selected, 'alarmMeasuredVarOid') : undefined;
  const measuredValue = selected ? varbind(selected, 'alarmMeasuredVarValue') : undefined;

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <header className={styles.panelHeader}>
        <h3>
          <span className={styles.liveDot} aria-hidden="true" />
          {t('title')}
        </h3>
        <span
          className={styles.liveBadge}
          data-state={error ? 'error' : sourceConfigured === false ? 'unmapped' : 'ready'}
        >
          <span className={styles.liveDot} aria-hidden="true" />
          {error ? t('unavailable') : sourceConfigured === false ? t('noMapping') : t('monitoring')}
        </span>
      </header>

      {error && (
        <p className={styles.alert} role="alert">
          {t('error')}: {error}
        </p>
      )}
      {loading && (
        <p className={styles.empty} role="status">
          {t('loading')}
        </p>
      )}
      {!loading && sourceConfigured === false && <p className={styles.empty}>{t('noSource')}</p>}
      {!loading && sourceConfigured && events.length === 0 && (
        <p className={styles.empty}>{t('empty')}</p>
      )}

      {events.length > 0 && (
        <div className={styles.trapWorkspace}>
          <div className={styles.trapList}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('time')}</th>
                    <th>{t('originShort')}</th>
                    <th>{t('condition')}</th>
                    <th>{t('severity')}</th>
                    <th>{t('state')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const origin = varbind(event, 'alarmSubsysSourceDescr');
                    const status = varbind(event, 'alarmSubsysStatusValue');
                    return (
                      <tr
                        key={event.id}
                        data-selected={event.id === selectedId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(event.id)}
                        onKeyDown={(keyboardEvent) => {
                          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                            keyboardEvent.preventDefault();
                            setSelectedId(event.id);
                          }
                        }}
                      >
                        <td>
                          <time dateTime={event.receivedAt}>
                            {localTime(event.receivedAt, locale)}
                          </time>
                        </td>
                        <td>{origin ? decodeValue(origin) : deviceName}</td>
                        <td>{status ? decodeValue(status) : (event.notificationName ?? '—')}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className={styles.trapDetail}>
            {!selected ? (
              <div className={styles.detailPlaceholder}>{t('selectTrap')}</div>
            ) : (
              <>
                <header className={styles.detailHeader}>
                  <div className={styles.detailIdentity}>
                    <span className={styles.bell} aria-hidden="true" />
                    <div>
                      <h4>{selected.notificationName ?? t('detail')}</h4>
                      <small>
                        {deviceName} · {localTime(selected.receivedAt, locale)}
                      </small>
                    </div>
                  </div>
                </header>

                <dl className={styles.contextList}>
                  <div>
                    <dt>{t('originShort')}</dt>
                    <dd>{sourceDescr ? decodeValue(sourceDescr) : selected.sourceIdentity}</dd>
                  </div>
                  <div>
                    <dt>{t('condition')}</dt>
                    <dd>{condition ? decodeValue(condition) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('severity')}</dt>
                    <dd>{severityLabel(selected.severity)}</dd>
                  </div>
                  <div>
                    <dt>{t('state')}</dt>
                    <dd>{stateLabel(selected.alarmState)}</dd>
                  </div>
                  <div>
                    <dt>{t('relatedSignal')}</dt>
                    <dd>{measuredOid ? decodeValue(measuredOid) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('measuredValue')}</dt>
                    <dd>{measuredValue ? decodeValue(measuredValue) : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('siteMapperAlarm')}</dt>
                    <dd>{selected.alarmCode ?? t('notRegistered')}</dd>
                  </div>
                </dl>

                <div className={styles.actions}>
                  <Link href="/alarms">{t('seeAlarms')}</Link>
                </div>

                <details className={styles.technicalDetails}>
                  <summary>{t('technicalDetails')}</summary>
                  <dl className={styles.varbindList}>
                    {selected.varbinds.map((item, index) => (
                      <div key={item.oid + ':' + index}>
                        <dt>{item.name ?? item.oid}</dt>
                        <dd>{decodeValue(item)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
