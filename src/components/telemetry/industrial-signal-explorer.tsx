'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type IndustrialSignal = {
  id: string;
  key: string;
  mibName: string | null;
  sourceIdentity: string;
  protocol: string;
  rawType: string;
  rawValue: unknown;
  lastObservation?: { rawType: string; rawValue: unknown; observedAt: string };
  value: number | string | boolean | null;
  unit: string | null;
  quality: string;
  interpretation?: string;
  enumLabel?: string | null;
  alarmState: string | null;
  observedAt: string;
  receivedAt: string;
  publication?: {
    stage: string;
    point: { unitId: number; address: number } | null;
  };
};

function rawText(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function IndustrialSignalExplorer() {
  const t = useTranslations('industrialSignalExplorer');
  const [expanded, setExpanded] = useState(false);
  const [sourceInput, setSourceInput] = useState('');
  const [source, setSource] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [signals, setSignals] = useState<IndustrialSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (source) params.set('source', source);
        if (cursor) params.set('cursor', cursor);
        const response = await fetch('/api/telemetry/industrial/signals?' + params, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = (await response.json()) as {
          signals?: IndustrialSignal[];
          nextCursor?: string | null;
        };
        if (!Array.isArray(data.signals)) throw new Error(t('invalidResponse'));
        if (!controller.signal.aborted) {
          setSignals(data.signals);
          setNextCursor(data.nextCursor ?? null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : t('catalogUnavailable'));
          setSignals([]);
          setNextCursor(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [expanded, source, cursor, refresh, t]);

  return (
    <section style={{ padding: '16px 24px', overflowWrap: 'anywhere' }}>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? t('hide') : t('show')}
      </button>
      {expanded && (
        <div style={{ marginTop: 12 }}>
          <p>{t('description')}</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSource(sourceInput.trim());
              setCursor(null);
              setPrevious([]);
            }}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
          >
            <label htmlFor="industrial-source-filter">{t('sourceLabel')}</label>
            <input
              id="industrial-source-filter"
              value={sourceInput}
              onChange={(event) => setSourceInput(event.target.value)}
              maxLength={120}
              placeholder={t('sourcePlaceholder')}
            />
            <button type="submit">{t('filter')}</button>
            <button type="button" onClick={() => setRefresh((value) => value + 1)}>
              {t('refresh')}
            </button>
          </form>
          <p role="status">
            {loading
              ? t('loading')
              : error
                ? t('error', { reason: error })
                : t('count', { count: signals.length })}
            {source ? t('source', { source }) : ''}
          </p>
          {!loading && !error && signals.length === 0 && <p>{t('empty')}</p>}
          <div style={{ overflowX: 'auto', maxHeight: 720, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>{t('variable')}</th>
                  <th>{t('raw')}</th>
                  <th>{t('interpretation')}</th>
                  <th>{t('quality')}</th>
                  <th>{t('sourceTime')}</th>
                  <th>{t('metasys')}</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((signal) => {
                  const recent = signal.lastObservation;
                  const raw = recent ? recent.rawValue : signal.rawValue;
                  const rawType = recent ? recent.rawType : signal.rawType;
                  return (
                    <tr key={signal.id}>
                      <td style={{ minWidth: 220, maxWidth: 340 }}>
                        <strong>{signal.mibName ?? t('oidUnknown')}</strong>
                        <div>
                          <code>{signal.key}</code>
                        </div>
                      </td>
                      <td style={{ minWidth: 150, maxWidth: 340 }}>
                        <code style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {rawText(raw)}
                        </code>
                        <div>
                          <small>{t('snmpType', { type: rawType })}</small>
                        </div>
                      </td>
                      <td>
                        {signal.alarmState && signal.alarmState !== 'UNKNOWN'
                          ? signal.alarmState
                          : signal.value === null
                            ? t('uninterpreted')
                            : signal.enumLabel
                              ? signal.enumLabel + ' (' + String(signal.value) + ')'
                              : String(signal.value)}
                        {signal.unit ? ' ' + signal.unit : ''}
                        <div>
                          <small>{signal.interpretation ?? 'UNINTERPRETED'}</small>
                        </div>
                      </td>
                      <td>{signal.quality}</td>
                      <td>
                        <code>{signal.sourceIdentity}</code>
                        <div>
                          <small>{recent?.observedAt ?? signal.observedAt}</small>
                        </div>
                      </td>
                      <td>
                        {signal.publication?.point
                          ? t('modbusPoint', {
                              unit: signal.publication.point.unitId,
                              address: signal.publication.point.address,
                            })
                          : (signal.publication?.stage ?? t('unassigned'))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav aria-label={t('pageNavigation')} style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button
              type="button"
              disabled={loading || previous.length === 0}
              onClick={() => {
                setCursor(previous[previous.length - 1] ?? null);
                setPrevious((items) => items.slice(0, -1));
              }}
            >
              {t('previous')}
            </button>
            <span>{t('page', { page: previous.length + 1 })}</span>
            <button
              type="button"
              disabled={loading || !nextCursor}
              onClick={() => {
                if (!nextCursor) return;
                setPrevious((items) => [...items, cursor]);
                setCursor(nextCursor);
              }}
            >
              {t('next')}
            </button>
          </nav>
        </div>
      )}
    </section>
  );
}
