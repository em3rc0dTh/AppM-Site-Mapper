'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import { TELEMETRY_HISTORY_WINDOWS } from '@/modules/telemetry/domain/history';
import { panelReportedPoints, telemetryMetrics } from './telemetry-presentation';

type IndustrialSignal = {
  id: string;
  logicalPointId?: string;
  authoritative?: boolean;
  observedAt: string;
  key: string;
  sourceIdentity: string;
  protocol: string;
  enumLabel?: string | null;
  interpretation?: string;
  publication?: { stage: string; point: { unitId: number; address: number } | null };
  value: number | string | boolean | null;
  unit: string | null;
  quality: string;
  alarmState: string | null;
  mibName: string | null;
  receivedAt: string;
};

type View = {
  targetId: string;
  status: string;
  sample: TelemetrySample | null;
  history: TelemetrySample[] | null;
};

export function EquipmentTelemetryInspector({
  targetId,
  label,
  pointPrefix,
  pointCapacity,
}: {
  targetId: string;
  label: string;
  pointPrefix?: string;
  pointCapacity?: number | undefined;
}) {
  const t = useTranslations('equipmentTelemetry');
  const [industrial, setIndustrial] = useState<{
    targetId: string;
    signals: IndustrialSignal[];
    alerts: string[];
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(
          `/api/telemetry/industrial/signals?${new URLSearchParams({ target: targetId })}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          signals: IndustrialSignal[];
          operational?: { alerts: string[] };
        };
        if (!controller.signal.aborted)
          setIndustrial({
            targetId,
            signals: body.signals,
            alerts: body.operational?.alerts ?? [],
          });
      } catch {
        /* Existing telemetry remains independent of optional industrial capture. */
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [targetId]);
  const [historySignal, setHistorySignal] = useState<IndustrialSignal | null>(null);
  const [industrialHistory, setIndustrialHistory] = useState<{
    targetId: string;
    signalId: string;
    observations: IndustrialSignal[];
    failed: boolean;
    hasMore: boolean;
  } | null>(null);
  useEffect(() => {
    if (!historySignal) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      from: new Date(Date.now() - 86400000).toISOString(),
      to: new Date().toISOString(),
      ...(historySignal.logicalPointId
        ? { logicalPointId: historySignal.logicalPointId }
        : { signalId: historySignal.id }),
    });
    void (async () => {
      try {
        const response = await fetch(`/api/telemetry/industrial/series?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('History unavailable');
        const body = (await response.json()) as {
          observations: IndustrialSignal[];
          nextCursor: string | null;
        };
        if (!controller.signal.aborted)
          setIndustrialHistory({
            targetId,
            signalId: historySignal.id,
            observations: body.observations,
            failed: false,
            hasMore: Boolean(body.nextCursor),
          });
      } catch {
        if (!controller.signal.aborted)
          setIndustrialHistory({
            targetId,
            signalId: historySignal.id,
            observations: [],
            failed: true,
            hasMore: false,
          });
      }
    })();
    return () => controller.abort();
  }, [historySignal, targetId]);
  const [window, setWindow] = useState('LIVE');
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(
          `/api/telemetry/entity?${new URLSearchParams({ targetId, window })}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const text = await response.text();
        let body: View & { error?: string };
        try {
          body = JSON.parse(text) as View & { error?: string };
        } catch {
          throw new Error('TELEMETRY_INVALID_RESPONSE (HTTP ' + response.status + ')');
        }
        if (!response.ok)
          throw new Error(body.error ?? 'TELEMETRY_UNAVAILABLE (HTTP ' + response.status + ')');
        if (!controller.signal.aborted) {
          setView(body);
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'TELEMETRY_UNAVAILABLE');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (window === 'LIVE') timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [targetId, window]);
  const current = view?.targetId === targetId ? view : null;
  const samples =
    loading || error
      ? []
      : window === 'LIVE'
        ? current?.sample
          ? [current.sample]
          : []
        : (current?.history ?? []);
  const visibleSamples = pointPrefix
    ? samples.filter(
        (sample) =>
          Object.keys(panelReportedPoints(sample.reported, pointPrefix, pointCapacity)).length > 0,
      )
    : samples;
  const pointGroupConfigured = Boolean(pointPrefix);
  return (
    <section className="zip-bdfb-live-average" aria-label={t('label', { name: label })}>
      <header>
        <strong>{window === 'LIVE' ? t('live') : t('history')}</strong>
        <span>
          {label} ·{' '}
          {pointGroupConfigured ? t('pointGroup', { prefix: pointPrefix ?? '' }) : t('ownReadings')}
        </span>
      </header>
      <div className="zip-bdfb-window-tabs" role="tablist" aria-label={t('timeWindow')}>
        {['LIVE', ...TELEMETRY_HISTORY_WINDOWS].map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={window === value}
            onClick={() => {
              if (window !== value) {
                setWindow(value);
                setLoading(true);
              }
            }}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>
      <p role="status">
        {loading
          ? t('loading')
          : error
            ? t('unavailable')
            : window === 'LIVE'
              ? current?.status
              : t('historicalPackets', { count: visibleSamples.length })}
      </p>
      {!loading && !error && !visibleSamples.length && (
        <p>{window === 'LIVE' ? t('noOwnMeasurements') : t('noStoredMeasurements')}</p>
      )}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {visibleSamples.map((sample) => (
          <article
            key={`${sample.bindingId}:${sample.receivedAt}`}
            style={{ overflowWrap: 'anywhere' }}
          >
            <small>
              {sample.sourceIdentity} · <time>{sample.sourceObservedAt ?? sample.receivedAt}</time>
            </small>
            <div className="zip-bdfb-live-average-grid">
              {telemetryMetrics(
                panelReportedPoints(sample.reported, pointPrefix, pointCapacity),
              ).map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>
                    {metric.value} {metric.unit}
                  </strong>
                </div>
              ))}
            </div>
            {pointGroupConfigured &&
              !Object.keys(panelReportedPoints(sample.reported, pointPrefix, pointCapacity))
                .length && <p>{t('noPoints', { prefix: pointPrefix ?? '' })}</p>}
          </article>
        ))}
      </div>
      <small>{t('last', { time: visibleSamples.at(-1)?.receivedAt ?? '—' })}</small>
      {window !== 'LIVE' && <p>{t('note')}</p>}
      {industrial?.targetId === targetId &&
        (industrial.signals.length > 0 || industrial.alerts.length > 0) && (
          <details>
            <summary>{t('industrialSignals', { count: industrial.signals.length })}</summary>
            {industrial.alerts.length > 0 && (
              <p role="status">
                {t('captureAlerts', { count: industrial.alerts.length })}:{' '}
                {industrial.alerts.join(', ')}
              </p>
            )}
            <div style={{ maxHeight: 320, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('signal')}</th>
                    <th>{t('value')}</th>
                    <th>{t('quality')}</th>
                  </tr>
                </thead>
                <tbody>
                  {industrial.signals.map((signal) => (
                    <tr key={signal.id}>
                      <td title={signal.key}>
                        {signal.mibName ?? signal.key}
                        <br />
                        <small>
                          {signal.sourceIdentity} · {signal.protocol}
                          {signal.logicalPointId && (
                            <>
                              <br />
                              {signal.logicalPointId} ·{' '}
                              {signal.authoritative ? t('activeSource') : t('historicalSource')}
                            </>
                          )}
                          <br />
                          <button type="button" onClick={() => setHistorySignal(signal)}>
                            {t('industrialHistory')}
                          </button>
                        </small>
                      </td>
                      <td>
                        {signal.alarmState ??
                          (signal.quality === 'VALID' && signal.value !== null
                            ? signal.enumLabel
                              ? `${signal.enumLabel} (${String(signal.value)})`
                              : String(signal.value)
                            : '—')}{' '}
                        {signal.unit ?? ''}
                        {signal.quality === 'UNKNOWN' && !signal.alarmState && (
                          <small> · {t('interpretationPending')}</small>
                        )}
                      </td>
                      <td>
                        {signal.quality} · <time>{signal.receivedAt}</time>
                        {signal.publication && (
                          <small>
                            <br />
                            {signal.publication.point
                              ? t('publishedPoint', {
                                  unit: signal.publication.point.unitId,
                                  address: signal.publication.point.address,
                                })
                              : t('publicationPending')}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historySignal && industrial.signals.some((s) => s.id === historySignal.id) && (
              <div role="region" aria-label={t('industrialHistory')}>
                <p>
                  {t('industrialHistory')} · {historySignal.logicalPointId ?? historySignal.key} ·
                  {'24 h'}
                </p>
                {industrialHistory?.targetId !== targetId ||
                industrialHistory?.signalId !== historySignal.id ? (
                  <p>{t('loading')}</p>
                ) : industrialHistory.failed ? (
                  <p role="status">{t('industrialHistoryUnavailable')}</p>
                ) : (
                  <div style={{ maxHeight: 240, overflow: 'auto' }}>
                    {industrialHistory.hasMore && <p>{t('industrialHistoryLimited')}</p>}
                    {industrialHistory.observations.length === 0 && (
                      <p>{t('industrialHistoryEmpty')}</p>
                    )}
                    <table>
                      <thead>
                        <tr>
                          <th>{t('signal')}</th>
                          <th>{t('value')}</th>
                          <th>{t('quality')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {industrialHistory.observations.map((s) => (
                          <tr key={`${s.id}:${s.observedAt}:${s.receivedAt}`}>
                            <td>
                              <time>{s.observedAt}</time>
                              <br />
                              <small>
                                {s.sourceIdentity} · {s.protocol}
                              </small>
                            </td>
                            <td>
                              {s.alarmState ?? (s.value === null ? '—' : String(s.value))} {s.unit}
                            </td>
                            <td>{s.quality}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </details>
        )}
    </section>
  );
}
