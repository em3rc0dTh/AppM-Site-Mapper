'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import { TELEMETRY_HISTORY_WINDOWS } from '@/modules/telemetry/domain/history';
import { panelReportedPoints, telemetryMetrics } from './telemetry-presentation';

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
          {label} · {pointGroupConfigured ? t('pointGroup', { prefix: pointPrefix ?? '' }) : t('ownReadings')}
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
          : (error ? t('unavailable') :
            (window === 'LIVE'
              ? current?.status
              : t('historicalPackets', { count: visibleSamples.length })))}
      </p>
      {!loading && !error && !visibleSamples.length && (
        <p>
          {window === 'LIVE'
            ? t('noOwnMeasurements')
            : t('noStoredMeasurements')}
        </p>
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
                .length && (
                <p>
                  {t('noPoints', { prefix: pointPrefix ?? '' })}
                </p>
              )}
          </article>
        ))}
      </div>
      <small>{t('last', { time: visibleSamples.at(-1)?.receivedAt ?? '—' })}</small>
      {window !== 'LIVE' && <p>{t('note')}</p>}
    </section>
  );
}
