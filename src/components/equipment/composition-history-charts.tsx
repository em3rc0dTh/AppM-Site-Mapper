'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CompositionHistoryPoint } from '@/modules/telemetry/application/composition-history';
import type { CompositionMetricKey } from '@/modules/telemetry/application/composition-telemetry-summary';
import type { TelemetryHistoryWindow } from '@/modules/telemetry/domain/history';

interface HistoryResponse {
  readonly equipmentId: string;
  readonly points: readonly CompositionHistoryPoint[];
  readonly breakerCount: number;
  readonly boundBreakerCount: number;
  readonly error?: string;
}

const METRICS: readonly { key: CompositionMetricKey; name: string; unit: string; color: string }[] =
  [
    { key: 'voltageV', name: 'Voltage', unit: 'V', color: '#257bb8' },
    { key: 'currentA', name: 'Current', unit: 'A', color: '#069e99' },
    { key: 'powerW', name: 'Power', unit: 'W', color: '#d47a29' },
    { key: 'energyKwh', name: 'Energy counter', unit: 'kWh', color: '#8467c8' },
  ];
const WINDOWS: readonly TelemetryHistoryWindow[] = ['24h', '7d', '15d', '1M'];

function formatValue(value: number, locale: string): string {
  return Number.isFinite(value) ? value.toLocaleString(locale, { maximumFractionDigits: 3 }) : '—';
}

function SeriesChart({
  name,
  unit,
  color,
  points,
  metric,
  window,
}: Readonly<{
  name: string;
  unit: string;
  color: string;
  points: readonly CompositionHistoryPoint[];
  metric: CompositionMetricKey;
  window: TelemetryHistoryWindow;
}>) {
  const t = useTranslations('historyCharts');
  const locale = useLocale();
  const observations = points.flatMap((point) => {
    const value = point.metrics[metric];
    const at = Date.parse(point.at);
    return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(at)
      ? [{ at, value, reporting: point.reportingChildren }]
      : [];
  });
  if (!observations.length) {
    return (
      <section className="ec-series">
        <strong>{name}</strong>
        <p>{t('empty')}</p>
      </section>
    );
  }
  const xStart = observations[0]!.at;
  const xEnd = observations.at(-1)!.at;
  const min = Math.min(...observations.map((item) => item.value));
  const max = Math.max(...observations.map((item) => item.value));
  const padding = (max - min || Math.max(Math.abs(max) * 0.1, 0.01)) * 0.12;
  const lower = Math.max(0, min - padding);
  const upper = max + padding;
  const x = (at: number) => 42 + ((at - xStart) / (xEnd - xStart || 1)) * 526;
  const y = (value: number) => 126 - ((value - lower) / (upper - lower || 1)) * 102;
  const maxGapMs =
    { '24h': 300_000, '7d': 3_600_000, '15d': 10_800_000, '1M': 21_600_000 }[window] * 2.5;
  const segments: (typeof observations)[] = [];
  for (const observation of observations) {
    const current = segments.at(-1);
    if (!current?.length || observation.at - current.at(-1)!.at > maxGapMs) {
      segments.push([observation]);
    } else {
      current.push(observation);
    }
  }
  const first = new Date(xStart).toLocaleString(locale, { timeZone: 'America/Lima' });
  const last = new Date(xEnd).toLocaleString(locale, { timeZone: 'America/Lima' });
  return (
    <section className="ec-series" aria-label={t('historicalTrend', { name })}>
      <header>
        <strong>{name}</strong>
        <span>
          {formatValue(observations.at(-1)!.value, locale)} {unit}
        </span>
      </header>
      <svg
        viewBox="0 0 590 162"
        role="img"
        aria-label={t('timeSeries', { name, count: observations.length, first, last })}
      >
        <line x1="42" y1="24" x2="568" y2="24" className="ec-chart-guide" />
        <line x1="42" y1="75" x2="568" y2="75" className="ec-chart-guide" />
        <line x1="42" y1="126" x2="568" y2="126" className="ec-chart-guide" />
        <text x="2" y="28" className="ec-chart-label">
          {formatValue(upper, locale)}
        </text>
        <text x="2" y="129" className="ec-chart-label">
          {formatValue(lower, locale)}
        </text>
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment
              .map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(2)} ${y(p.value).toFixed(2)}`)
              .join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {observations.length <= 220 &&
          observations.map((point) => (
            <circle key={point.at} cx={x(point.at)} cy={y(point.value)} r="2.9" fill={color}>
              <title>
                {t('tooltip', {
                  date: new Date(point.at).toLocaleString(locale, { timeZone: 'America/Lima' }),
                  value: formatValue(point.value, locale),
                  unit,
                  count: point.reporting,
                })}
              </title>
            </circle>
          ))}
        <text x="42" y="151" className="ec-chart-label">
          {new Date(xStart).toLocaleDateString()}
        </text>
        <text x="568" y="151" textAnchor="end" className="ec-chart-label">
          {new Date(xEnd).toLocaleDateString()}
        </text>
      </svg>
      <small>{t('buckets', { count: observations.length })}</small>
    </section>
  );
}

export function CompositionHistoryCharts({
  equipmentId,
  equipmentType,
}: Readonly<{ equipmentId: string; equipmentType: string }>) {
  const t = useTranslations('historyCharts');
  const locale = useLocale();
  const [window, setWindow] = useState<TelemetryHistoryWindow>('24h');
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/telemetry/composition-history?equipmentId=${encodeURIComponent(equipmentId)}&window=${window}`,
      {
        cache: 'no-store',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body = (await response.json()) as HistoryResponse;
        if (!response.ok) throw new Error(body.error ?? `History HTTP ${response.status}`);
        if (!controller.signal.aborted) setData(body);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'History unavailable');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [equipmentId, window]);

  const last = data?.points.at(-1);
  const denominator =
    equipmentType === 'PANEL'
      ? last?.positions
      : equipmentType === 'CIRCUIT_BREAKER'
        ? 1
        : last?.installedChildren;
  const coverage =
    equipmentType === 'PANEL'
      ? last?.reporting
      : equipmentType === 'CIRCUIT_BREAKER'
        ? last?.reporting
        : last?.reportingChildren;
  return (
    <div className="ec-history-charts">
      <div className="ec-history-controls">
        <strong>{t('title')}</strong>
        <div role="group" aria-label={t('range')}>
          {WINDOWS.map((range) => (
            <button
              type="button"
              key={range}
              aria-pressed={window === range}
              onClick={() => {
                if (range !== window) {
                  setLoading(true);
                  setError('');
                  setData(null);
                  setWindow(range);
                }
              }}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {loading && <p role="status">{t('loading')}</p>}
      {error && <p role="alert">{t('error', { error })}</p>}
      {!loading && data && (
        <>
          <div className="ec-history-coverage">
            <span>{t('timeBuckets', { count: data.points.length })}</span>
            <span>
              {t('bindings', { bound: data.boundBreakerCount, total: data.breakerCount })}
            </span>
            <span>
              {last
                ? t('reporting', { count: coverage ?? 0, total: denominator ?? 0 })
                : t('noRecord')}
            </span>
          </div>
          {last && (
            <small>
              {t('last', {
                date: new Date(last.at).toLocaleString(locale, { timeZone: 'America/Lima' }),
              })}
            </small>
          )}
          {!data.points.length ? (
            <p>{t('noReadings')}</p>
          ) : (
            <div className="ec-history-grid">
              {METRICS.map((metric) => (
                <SeriesChart
                  key={metric.key}
                  name={
                    metric.key === 'voltageV'
                      ? t('metricVoltage')
                      : metric.key === 'currentA'
                        ? t('metricCurrent')
                        : metric.key === 'powerW'
                          ? t('metricPower')
                          : t('metricEnergy')
                  }
                  unit={metric.unit}
                  color={metric.color}
                  points={data.points}
                  metric={metric.key}
                  window={window}
                />
              ))}
            </div>
          )}
          <p className="ec-history-explainer">{t('bucketDisclaimer')}</p>
        </>
      )}
    </div>
  );
}
