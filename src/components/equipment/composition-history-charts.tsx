'use client';

import { useEffect, useState } from 'react';
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

const METRICS: readonly { key: CompositionMetricKey; name: string; unit: string; color: string }[] = [
  { key: 'voltageV', name: 'Voltage', unit: 'V', color: '#257bb8' },
  { key: 'currentA', name: 'Current', unit: 'A', color: '#069e99' },
  { key: 'powerW', name: 'Power', unit: 'W', color: '#d47a29' },
  { key: 'energyKwh', name: 'Energy counter', unit: 'kWh', color: '#8467c8' },
];
const WINDOWS: readonly TelemetryHistoryWindow[] = ['24h', '7d', '15d', '1M'];

function formatValue(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—';
}

function SeriesChart({
  name, unit, color, points, metric,
}: Readonly<{
  name: string;
  unit: string;
  color: string;
  points: readonly CompositionHistoryPoint[];
  metric: CompositionMetricKey;
}>) {
  const observations = points.flatMap((point) => {
    const value = point.metrics[metric];
    const at = Date.parse(point.at);
    return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(at)
      ? [{ at, value, reporting: point.reportingChildren }] : [];
  });
  if (!observations.length) {
    return <section className="ec-series"><strong>{name}</strong><p>No historical measurements for this metric.</p></section>;
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
  const path = observations.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ');
  const first = new Date(xStart).toLocaleString();
  const last = new Date(xEnd).toLocaleString();
  return (
    <section className="ec-series" aria-label={name + ' historical trend'}>
      <header><strong>{name}</strong><span>{formatValue(observations.at(-1)!.value)} {unit}</span></header>
      <svg viewBox="0 0 590 162" role="img" aria-label={`${name} time series with ${observations.length} recorded points from ${first} to ${last}`}>
        <line x1="42" y1="24" x2="568" y2="24" className="ec-chart-guide" />
        <line x1="42" y1="75" x2="568" y2="75" className="ec-chart-guide" />
        <line x1="42" y1="126" x2="568" y2="126" className="ec-chart-guide" />
        <text x="2" y="28" className="ec-chart-label">{formatValue(upper)}</text>
        <text x="2" y="129" className="ec-chart-label">{formatValue(lower)}</text>
        <path d={path} fill="none" stroke={color} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
        {observations.length === 1 ? (
          <circle cx={x(xStart)} cy={y(observations[0]!.value)} r="4" fill={color}>
            <title>{`${first}: ${formatValue(observations[0]!.value)} ${unit}`}</title>
          </circle>
        ) : null}
        <text x="42" y="151" className="ec-chart-label">{new Date(xStart).toLocaleDateString()}</text>
        <text x="568" y="151" textAnchor="end" className="ec-chart-label">{new Date(xEnd).toLocaleDateString()}</text>
      </svg>
      <small>{observations.length} recorded time buckets · missing observations are not zero</small>
    </section>
  );
}

export function CompositionHistoryCharts({
  equipmentId, equipmentType,
}: Readonly<{ equipmentId: string; equipmentType: string }>) {
  const [window, setWindow] = useState<TelemetryHistoryWindow>('24h');
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    void fetch(`/api/telemetry/composition-history?equipmentId=${encodeURIComponent(equipmentId)}&window=${window}`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as HistoryResponse;
      if (!response.ok) throw new Error(body.error ?? `History HTTP ${response.status}`);
      if (!controller.signal.aborted) setData(body);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'History unavailable');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [equipmentId, window]);

  const last = data?.points.at(-1);
  const denominator = equipmentType === 'PANEL' ? last?.positions : equipmentType === 'CIRCUIT_BREAKER' ? 1 : last?.installedChildren;
  const coverage = equipmentType === 'PANEL' ? last?.reporting : equipmentType === 'CIRCUIT_BREAKER' ? last?.reporting : last?.reportingChildren;
  return (
    <div className="ec-history-charts">
      <div className="ec-history-controls">
        <strong>MQTT · historical trend</strong>
        <div role="group" aria-label="Historical range">
          {WINDOWS.map((range) => (
            <button type="button" key={range} aria-pressed={window === range} onClick={() => setWindow(range)}>
              {range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {loading && <p role="status">Loading verified historical readings…</p>}
      {error && <p role="alert">History unavailable: {error}</p>}
      {!loading && data && (
        <>
          <div className="ec-history-coverage">
            <span>{data.points.length} time buckets</span>
            <span>{data.boundBreakerCount}/{data.breakerCount} breakers with MQTT bindings</span>
            <span>
              {last ? `${coverage ?? 0}/${denominator ?? 0} reporting in last historical bucket` : 'No recorded readings'}
            </span>
          </div>
          {last && <small>Last historical bucket: {new Date(last.at).toLocaleString()}</small>}
          {!data.points.length ? (
            <p>No commissioned MQTT breaker readings were stored for this scope and period.</p>
          ) : (
            <div className="ec-history-grid">
              {METRICS.map((metric) => (
                <SeriesChart key={metric.key} name={metric.name} unit={metric.unit}
                  color={metric.color} points={data.points} metric={metric.key} />
              ))}
            </div>
          )}
          <p className="ec-history-explainer">
            Each bucket is an arithmetic mean of the reporting immediate-child means.
            Values are not feed totals; cumulative energy counters are not interval consumption.
            SNMP incoming shunts remain a separate electrical source.
          </p>
        </>
      )}
    </div>
  );
}
