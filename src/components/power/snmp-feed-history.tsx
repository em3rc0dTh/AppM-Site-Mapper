'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';
import type { SnmpHistoricalBucket } from '@/modules/telemetry/infrastructure/http-telemetry-store';

interface FeedHistory {
  accessPortId: string;
  label: string;
  side: string | null;
  feedPosition: string | null;
  sourceMode: 'SYNTHETIC_LAB_ONLY' | 'FIELD';
  points: SnmpHistoricalBucket[];
}

interface TrendResult {
  feeds: FeedHistory[];
  energySource: string;
  maxIntegratedGapSeconds: number;
}

type ChartMetric = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

interface Point {
  time: number;
  value: number;
}
interface Series {
  name: string;
  lab: boolean;
  values: Point[];
}

const SERIES_STROKES = ['#1b70b2', '#0f9387', '#8f62b3', '#d19b34'];
const METRICS: { key: ChartMetric; title: string; unit: string; digits: number }[] = [
  { key: 'voltageV', title: 'VOLTAGE · SHUNTS A/B', unit: 'V DC', digits: 1 },
  { key: 'currentA', title: 'CURRENT · SHUNTS A/B', unit: 'A', digits: 1 },
  { key: 'powerW', title: 'ESTIMATED POWER · |V| × I', unit: 'W', digits: 1 },
  { key: 'energyKwh', title: 'ESTIMATED ENERGY · OBSERVED INTERVALS', unit: 'kWh', digits: 4 },
];

function createSeries(feeds: readonly FeedHistory[], metric: ChartMetric): Series[] {
  return feeds.map((feed) => {
    let accumulatedEnergy = 0;
    const values = feed.points.flatMap((point) => {
      const time = Date.parse(point.bucketAt);
      if (!Number.isFinite(time)) return [];
      let value: number | null;
      if (metric === 'energyKwh') {
        if (point.estimatedEnergyKwh === null) return [];
        accumulatedEnergy += point.estimatedEnergyKwh;
        value = accumulatedEnergy;
      } else {
        value = point[metric];
      }
      return typeof value === 'number' && Number.isFinite(value) ? [{ time, value }] : [];
    });
    return {
      name: feed.feedPosition ?? feed.side ?? feed.label,
      lab: feed.sourceMode === 'SYNTHETIC_LAB_ONLY',
      values,
    };
  });
}

function TrendChart({
  metric,
  feeds,
  window,
}: Readonly<{
  metric: (typeof METRICS)[number];
  feeds: readonly FeedHistory[];
  window: TelemetryHistoryWindow;
}>) {
  const tu = useTranslations('snmpHistoryUi');
  const series = useMemo(() => createSeries(feeds, metric.key), [feeds, metric.key]);
  const all = series.flatMap((item) => item.values);
  const last = all.length ? Math.max(...all.map((point) => point.time)) : null;
  // Deterministic history time domain: no render-time wall clock is used.
  const maxT = last ?? 0;
  const minT = maxT - { '24h': 86400, '7d': 604800, '15d': 1296000, '1M': 2592000 }[window] * 1000;
  const vMin = all.length ? Math.min(...all.map((point) => point.value)) : 0;
  const vMax = all.length ? Math.max(...all.map((point) => point.value)) : 0;
  const pad = Math.max(Math.abs(vMax - vMin) * 0.12, 0.001);
  const low = vMin - pad;
  const high = vMax + pad;
  const width = 320;
  const height = 116;
  const plotX = 42;
  const plotY = 12;
  const plotW = width - plotX - 12;
  const plotH = height - plotY - 22;
  const x = (time: number) =>
    plotX + ((Math.max(minT, Math.min(time, maxT)) - minT) / (maxT - minT || 1)) * plotW;
  const y = (value: number) => plotY + ((high - value) / (high - low || 1)) * plotH;
  const intervalMs = { '24h': 300, '7d': 1800, '15d': 3600, '1M': 7200 }[window] * 1000;
  const strokes = series.map((item) => {
    const segments: Point[][] = [];
    for (const point of item.values) {
      const segment = segments.at(-1);
      if (!segment || point.time - segment.at(-1)!.time > intervalMs * 2.5) segments.push([point]);
      else segment.push(point);
    }
    return segments;
  });
  const format = (v: number) => (Number.isFinite(v) ? v.toFixed(metric.digits) : '—');
  return (
    <div className="sm-snmp-history-chart">
      <div className="sm-snmp-history-heading">
        <strong>
          {metric.key === 'voltageV'
            ? tu('metricVoltage')
            : metric.key === 'currentA'
              ? tu('metricCurrent')
              : metric.key === 'powerW'
                ? tu('metricPower')
                : tu('metricEnergy')}
        </strong>
        <small>{metric.unit}</small>
      </div>
      {all.length === 0 ? (
        <p>{tu('noPairs')}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={tu('metricHistoryLabel', { metric: metric.key === 'voltageV' ? tu('metricVoltage') : metric.key === 'currentA' ? tu('metricCurrent') : metric.key === 'powerW' ? tu('metricPower') : tu('metricEnergy'), window })}
          >
            <line
              x1={plotX}
              y1={plotY + plotH}
              x2={width - 12}
              y2={plotY + plotH}
              stroke="#b9c8d7"
              strokeWidth="1"
            />
            <line
              x1={plotX}
              y1={plotY}
              x2={plotX}
              y2={plotY + plotH}
              stroke="#b9c8d7"
              strokeWidth="1"
            />
            <text x="3" y={plotY + 8} fontSize="10" fill="#5b6e7e">
              {format(vMax)}
            </text>
            <text x="3" y={plotY + plotH - 1} fontSize="10" fill="#5b6e7e">
              {format(vMin)}
            </text>
            {strokes.map((segments, index) =>
              segments.map((segment, seg) =>
                segment.length > 1 ? (
                  <polyline
                    key={`${index}:${seg}`}
                    fill="none"
                    stroke={SERIES_STROKES[index % SERIES_STROKES.length]}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={segment
                      .map((p) => `${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`)
                      .join(' ')}
                  />
                ) : (
                  <circle
                    key={`${index}:${seg}`}
                    cx={x(segment[0]!.time)}
                    cy={y(segment[0]!.value)}
                    r="2.5"
                    fill={SERIES_STROKES[index % SERIES_STROKES.length]}
                  />
                ),
              ),
            )}
          </svg>
          <div className="sm-snmp-history-legend">
            {series.map((item, i) => (
              <span key={feeds[i]!.accessPortId}>
                <i
                  aria-hidden="true"
                  style={{ background: SERIES_STROKES[i % SERIES_STROKES.length] }}
                />
                {item.name}
                {item.lab ? ' (LAB)' : ''}:{' '}
                {item.values.length ? format(item.values.at(-1)!.value) : '—'} {metric.unit}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function SnmpFeedHistory({ deviceId }: Readonly<{ deviceId: string }>) {
  const tu = useTranslations('snmpHistoryUi');
  const t = useTranslations('snmp.history');
  const [window, setWindow] = useState<TelemetryHistoryWindow>('24h');
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('currentA');
  const [data, setData] = useState<TrendResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/telemetry/snmp/feeds/trends?deviceId=${encodeURIComponent(deviceId)}&window=${window}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const result = (await response.json()) as TrendResult & { error?: string };
        if (!response.ok) throw new Error(result.error ?? `HTTP_${response.status}`);
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(cause instanceof Error ? cause.message : 'HISTORY_UNAVAILABLE');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchHistory();
    return () => controller.abort();
  }, [deviceId, window]);

  const coverage =
    data?.feeds.reduce(
      (sum, feed) => sum + feed.points.reduce((acc, point) => acc + point.coveredSeconds, 0),
      0,
    ) ?? 0;
  const latest =
    data?.feeds.reduce(
      (sum, feed) =>
        sum + feed.points.reduce((acc, point) => acc + (point.estimatedEnergyKwh ?? 0), 0),
      0,
    ) ?? 0;

  return (
    <section className="zip-bdfb-live-average sm-snmp-history" aria-label={tu('charts')}>
      <header>
        <strong>{tu('title')}</strong>
        <span>{tu('shunts')}</span>
      </header>
      <div className="zip-bdfb-window-tabs" role="tablist" aria-label={tu('window')}>
        {TELEMETRY_HISTORY_WINDOWS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={window === option}
            onClick={() => setWindow(option)}
          >
            {option === '1M' ? '1M' : option.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="sm-snmp-history-metric-tabs" role="tablist" aria-label={tu('metric')}>
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selectedMetric === item.key}
            onClick={() => setSelectedMetric(item.key)}
          >
            {item.key === 'currentA'
              ? t('current')
              : item.key === 'voltageV'
                ? t('voltage')
                : item.key === 'powerW'
                  ? t('power')
                  : t('energy')}
          </button>
        ))}
      </div>
      {loading && <p role="status">{tu('loading')}</p>}
      {error && (
        <p role="alert" className="form-error">
          {tu('error', { error })}
        </p>
      )}
      {!loading && !error && data && (
        <>
          {data.feeds.every((feed) => feed.points.length === 0) ? (
            <p>{tu('empty')}</p>
          ) : (
            <div className="sm-snmp-history-metrics">
              {METRICS.filter((item) => item.key === selectedMetric).map((item) => (
                <TrendChart key={item.key} metric={item} feeds={data.feeds} window={window} />
              ))}
            </div>
          )}
          <div className="sm-snmp-history-footnote">
            <strong>{tu('energy', { value: latest.toFixed(4) })}</strong>
            <small>{tu('coverage', { minutes: (coverage / 60).toFixed(1) })}</small>
            <small>{tu('note')}</small>
          </div>
        </>
      )}
    </section>
  );
}
