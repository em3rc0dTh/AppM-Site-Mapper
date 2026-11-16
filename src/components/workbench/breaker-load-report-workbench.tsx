'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { CompositionHistoryPoint } from '@/modules/telemetry/application/composition-history';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';

interface HistoryResponse {
  readonly equipmentId: string;
  readonly window: TelemetryHistoryWindow;
  readonly breakerCount: number;
  readonly boundBreakerCount: number;
  readonly points: readonly CompositionHistoryPoint[];
  readonly error?: string;
}

type NumericMetric = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

function valuesFor(
  points: readonly CompositionHistoryPoint[],
  metric: NumericMetric,
  scale = 1,
): number[] {
  return points.flatMap((point) => {
    const value = point.metrics[metric];
    return typeof value === 'number' && Number.isFinite(value) ? [value * scale] : [];
  });
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function minimum(values: readonly number[]): number | null {
  return values.length ? Math.min(...values) : null;
}

function maximum(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

function metric(value: number | null, unit: string, digits = 2): string {
  return value === null ? '—' : `${value.toFixed(digits)} ${unit}`;
}

function Trend({
  points,
  label,
}: Readonly<{ points: readonly CompositionHistoryPoint[]; label: string }>) {
  const values = points.flatMap((point) => {
    const power = point.metrics.powerW;
    const at = Date.parse(point.at);
    return typeof power === 'number' && Number.isFinite(power) && Number.isFinite(at)
      ? [{ time: at, value: power / 1000 }]
      : [];
  });
  if (!values.length) return <div className="sm-workbench-empty">—</div>;
  const width = 1100;
  const height = 270;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || Math.max(Math.abs(max) * 0.1, 0.001);
  const first = values[0]!.time;
  const last = values.at(-1)!.time;
  const x = (time: number) => 55 + ((time - first) / (last - first || 1)) * (width - 90);
  const y = (value: number) => 20 + (1 - (value - min) / range) * (height - 65);
  const path = values
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'} ${x(point.time).toFixed(2)} ${y(point.value).toFixed(2)}`,
    )
    .join(' ');
  return (
    <section className="sm-load-report-trend">
      <header>
        <strong>{label}</strong>
        <span>kW</span>
      </header>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line x1="55" y1="20" x2={width - 35} y2="20" />
        <line x1="55" y1={height - 45} x2={width - 35} y2={height - 45} />
        <path d={path} />
      </svg>
      <footer>
        <span>{min.toFixed(3)} kW</span>
        <span>{max.toFixed(3)} kW</span>
      </footer>
    </section>
  );
}

export function BreakerLoadReportWorkbench({
  equipmentId,
  breakerName,
  qdfName,
  panelName,
  position,
  initialWindow,
}: Readonly<{
  equipmentId: string;
  breakerName: string;
  qdfName: string;
  panelName: string;
  position: number | null;
  initialWindow: TelemetryHistoryWindow;
}>) {
  const t = useTranslations('workbench');
  const [windowRange, setWindowRange] = useState<TelemetryHistoryWindow>(initialWindow);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/telemetry/composition-history?equipmentId=${encodeURIComponent(equipmentId)}&window=${windowRange}`,
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as HistoryResponse;
        if (!response.ok) throw new Error(body.error ?? `HTTP_${response.status}`);
        if (!controller.signal.aborted) setData(body);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'BREAKER_REPORT_FAILED');
      });
    return () => controller.abort();
  }, [equipmentId, refresh, windowRange]);

  const stats = useMemo(() => {
    if (!data) return null;
    const voltage = valuesFor(data.points, 'voltageV');
    const current = valuesFor(data.points, 'currentA');
    const power = valuesFor(data.points, 'powerW', 0.001);
    const energy = valuesFor(data.points, 'energyKwh');
    const voltageMin = minimum(voltage);
    const voltageMax = maximum(voltage);
    return {
      voltage: {
        min: voltageMin,
        average: average(voltage),
        max: voltageMax,
        variation: voltageMin !== null && voltageMax !== null ? voltageMax - voltageMin : null,
      },
      current: { average: average(current), peak: maximum(current) },
      power: { average: average(power), peak: maximum(power) },
      energy: { latest: energy.at(-1) ?? null },
    };
  }, [data]);

  function exportCsv() {
    if (!data || !stats) return;
    const rows: (string | number)[][] = [
      ['breaker', breakerName],
      ['qdf', qdfName],
      ['panel', panelName],
      ['position', position ?? ''],
      ['window', windowRange],
      ['minimum_voltage_v', stats.voltage.min ?? ''],
      ['average_voltage_v', stats.voltage.average ?? ''],
      ['maximum_voltage_v', stats.voltage.max ?? ''],
      ['voltage_variation_v', stats.voltage.variation ?? ''],
      ['average_current_a', stats.current.average ?? ''],
      ['peak_current_a', stats.current.peak ?? ''],
      ['average_power_kw', stats.power.average ?? ''],
      ['peak_power_kw', stats.power.peak ?? ''],
      ['latest_energy_counter_kwh', stats.energy.latest ?? ''],
      [],
      ['timestamp', 'voltage_v', 'current_a', 'power_kw', 'energy_counter_kwh'],
      ...data.points.map((point) => [
        point.at,
        point.metrics.voltageV ?? '',
        point.metrics.currentA ?? '',
        typeof point.metrics.powerW === 'number' ? point.metrics.powerW / 1000 : '',
        point.metrics.energyKwh ?? '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${breakerName.replace(/[^a-z0-9_-]+/gi, '-')}-report-${windowRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="sm-workbench sm-load-report">
      <header className="sm-workbench-header">
        <div>
          <small>{t('breakerReportTitle')}</small>
          <h1>{breakerName}</h1>
          <p>
            {qdfName} · {panelName}
            {position !== null ? ` · ${t('position')} ${position}` : ''}
          </p>
        </div>
        <div className="sm-workbench-header-actions">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || !stats || !data.points.length}
          >
            {t('exportCsv')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data || !stats || !data.points.length}
          >
            {t('printPdf')}
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setData(null);
              setRefresh((value) => value + 1);
            }}
          >
            {t('refresh')}
          </button>
          <button type="button" onClick={() => window.close()}>
            {t('close')}
          </button>
        </div>
      </header>

      <div className="sm-workbench-window-tabs" aria-label={t('reportWindow')}>
        {TELEMETRY_HISTORY_WINDOWS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={windowRange === item}
            onClick={() => {
              if (item !== windowRange) {
                setError('');
                setData(null);
                setWindowRange(item);
              }
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      {error ? <p className="sm-workbench-error">{t('unavailable')}</p> : null}
      {!data && !error ? <p>{t('loading')}</p> : null}
      {data && !data.points.length ? (
        <p className="sm-workbench-empty">{t('noBreakerSamples')}</p>
      ) : null}

      {data && stats && data.points.length ? (
        <>
          <section className="sm-load-report-meta">
            <span>
              <b>{t('acceptedIntervals')}:</b> {data.points.length}
            </span>
          </section>

          <section>
            <h2>{t('summary')}</h2>
            <div className="sm-load-report-kpis sm-load-report-kpis--electrical">
              <article>
                <small>{t('voltage')}</small>
                <strong>{metric(stats.voltage.average, 'V')}</strong>
                <dl>
                  <div>
                    <dt>{t('min')}</dt>
                    <dd>{metric(stats.voltage.min, 'V')}</dd>
                  </div>
                  <div>
                    <dt>{t('average')}</dt>
                    <dd>{metric(stats.voltage.average, 'V')}</dd>
                  </div>
                  <div>
                    <dt>{t('max')}</dt>
                    <dd>{metric(stats.voltage.max, 'V')}</dd>
                  </div>
                  <div>
                    <dt>{t('voltageVariation')}</dt>
                    <dd>{metric(stats.voltage.variation, 'V')}</dd>
                  </div>
                </dl>
              </article>
              <article>
                <small>{t('current')}</small>
                <strong>{metric(stats.current.average, 'A')}</strong>
                <dl>
                  <div>
                    <dt>{t('average')}</dt>
                    <dd>{metric(stats.current.average, 'A')}</dd>
                  </div>
                  <div>
                    <dt>{t('peak')}</dt>
                    <dd>{metric(stats.current.peak, 'A')}</dd>
                  </div>
                </dl>
              </article>
              <article>
                <small>{t('power')}</small>
                <strong>{metric(stats.power.average, 'kW', 3)}</strong>
                <dl>
                  <div>
                    <dt>{t('average')}</dt>
                    <dd>{metric(stats.power.average, 'kW', 3)}</dd>
                  </div>
                  <div>
                    <dt>{t('peak')}</dt>
                    <dd>{metric(stats.power.peak, 'kW', 3)}</dd>
                  </div>
                </dl>
              </article>
              <article>
                <small>{t('energy')}</small>
                <strong>{metric(stats.energy.latest, 'kWh', 4)}</strong>
                <dl>
                  <div>
                    <dt>{t('lastEnergyCounter')}</dt>
                    <dd>{metric(stats.energy.latest, 'kWh', 4)}</dd>
                  </div>
                </dl>
                <p className="sm-load-report-card-note">{t('energyCounterHelp')}</p>
              </article>
            </div>
          </section>

          <Trend points={data.points} label={t('power')} />
        </>
      ) : null}
    </main>
  );
}
