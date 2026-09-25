'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  DemoTelemetryHistoryPoint,
  DemoTelemetryHistoryRange,
} from '@/modules/telemetry/application/demo-telemetry-history';

const METRICS = ['U1', 'I1', 'P1', 'EP1'] as const;
type HistoryMetric = (typeof METRICS)[number];

interface HistoryResponse {
  readonly synthetic: boolean;
  readonly points: readonly DemoTelemetryHistoryPoint[];
}

function numericSeries(points: readonly DemoTelemetryHistoryPoint[], metric: HistoryMetric) {
  return points.flatMap((point) => {
    const raw = point.values[metric];
    if (raw === undefined) return [];

    const value = Number(raw);
    return Number.isFinite(value) ? [{ observedAt: point.observedAt, value }] : [];
  });
}

function polyline(series: readonly { value: number }[]) {
  if (!series.length) return '';

  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);

  return series
    .map((point, index) => {
      const x = series.length === 1 ? 50 : (index / (series.length - 1)) * 100;
      const y = 92 - ((point.value - min) / span) * 78;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function BreakerHistoryPanel({
  entityId,
  componentAddress,
}: Readonly<{
  entityId: string;
  componentAddress: string;
}>) {
  const [range, setRange] = useState<DemoTelemetryHistoryRange>('7d');
  const [metric, setMetric] = useState<HistoryMetric>('U1');
  const [points, setPoints] = useState<readonly DemoTelemetryHistoryPoint[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');

    const params = new URLSearchParams({
      entityId,
      componentAddress,
      range,
    });

    void fetch(`/api/telemetry/demo-history?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`History query failed with HTTP ${response.status}`);
        }

        return (await response.json()) as HistoryResponse;
      })
      .then((payload) => {
        setPoints(payload.points);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setStatus('error');
      });

    return () => controller.abort();
  }, [componentAddress, entityId, range]);

  const series = useMemo(() => numericSeries(points, metric), [metric, points]);
  const path = useMemo(() => polyline(series), [series]);
  const onlineSamples = points.filter((point) => point.state.toUpperCase() === 'ONLINE').length;
  const availability = points.length ? (onlineSamples / points.length) * 100 : 0;
  const values = series.map((point) => point.value);
  const latest = values.at(-1);
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

  return (
    <div className="breaker-history">
      <div className="breaker-history-toolbar">
        <div className="breaker-history-ranges" role="group" aria-label="History range">
          {(['24h', '7d', '30d'] as const).map((candidate) => (
            <button
              type="button"
              key={candidate}
              className={candidate === range ? 'is-active' : ''}
              onClick={() => setRange(candidate)}
            >
              {candidate.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="breaker-history-metrics" role="group" aria-label="History metric">
          {METRICS.map((candidate) => (
            <button
              type="button"
              key={candidate}
              className={candidate === metric ? 'is-active' : ''}
              onClick={() => setMetric(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && <p className="breaker-history-state">Loading synthetic history…</p>}
      {status === 'error' && (
        <p className="breaker-history-state breaker-history-state--error">
          Historical demo data is unavailable.
        </p>
      )}

      {status === 'ready' && (
        <>
          <div className="breaker-history-summary">
            <span>
              Availability <strong>{availability.toFixed(1)}%</strong>
            </span>
            <span>
              Samples <strong>{points.length}</strong>
            </span>
            <span>
              Latest <strong>{latest === undefined ? '—' : latest.toFixed(2)}</strong>
            </span>
          </div>

          {series.length ? (
            <>
              <div className="breaker-history-chart" aria-label={`${metric} synthetic history`}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
                  <line x1="0" y1="92" x2="100" y2="92" />
                  <line x1="0" y1="53" x2="100" y2="53" />
                  <line x1="0" y1="14" x2="100" y2="14" />
                  <polyline points={path} />
                </svg>
              </div>
              <div className="breaker-history-stats">
                <span>
                  MIN <strong>{minimum?.toFixed(2)}</strong>
                </span>
                <span>
                  AVG <strong>{average?.toFixed(2)}</strong>
                </span>
                <span>
                  MAX <strong>{maximum?.toFixed(2)}</strong>
                </span>
              </div>
              <div className="breaker-history-axis">
                <span>{series[0] ? formatDate(series[0].observedAt) : ''}</span>
                <span>{series.at(-1) ? formatDate(series.at(-1)!.observedAt) : ''}</span>
              </div>
            </>
          ) : (
            <div className="breaker-history-empty">
              <strong>State-only history</strong>
              <span>
                The observed hardware profile does not provide scalar {metric} values for this
                breaker address. Availability is shown without inventing measurements.
              </span>
            </div>
          )}

          <p className="breaker-history-note">
            SYNTHETIC HISTORY · seeded hourly for demo use only
          </p>
        </>
      )}
    </div>
  );
}
