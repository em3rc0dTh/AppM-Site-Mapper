'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { CompositionHistoryPoint } from '@/modules/telemetry/application/composition-history';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';

interface HistoryResponse {
  readonly points: readonly CompositionHistoryPoint[];
  readonly error?: string;
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
function peakMagnitude(values: readonly number[]): number | null {
  return values.length ? Math.max(...values.map((value) => Math.abs(value))) : null;
}
function metric(value: number | null, unit: string, digits = 2): string {
  return value === null ? '—' : `${value.toFixed(digits)} ${unit}`;
}

export function BreakerLoadReportWorkbench({
  equipmentId,
  equipmentName,
  context,
  initialWindow,
}: Readonly<{
  equipmentId: string;
  equipmentName: string;
  context: string;
  initialWindow: TelemetryHistoryWindow;
}>) {
  const t = useTranslations('workbench');
  const locale = useLocale();
  const [windowRange, setWindowRange] = useState(initialWindow);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState('');

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
  }, [equipmentId, windowRange]);

  const summary = useMemo(() => {
    const points = data?.points ?? [];
    const voltage = points.flatMap((p) => typeof p.metrics.voltageV === 'number' ? [p.metrics.voltageV] : []);
    const current = points.flatMap((p) => typeof p.metrics.currentA === 'number' ? [p.metrics.currentA] : []);
    const power = points.flatMap((p) => typeof p.metrics.powerW === 'number' ? [p.metrics.powerW / 1000] : []);
    const energy = points.flatMap((p) => typeof p.metrics.energyKwh === 'number' ? [p.metrics.energyKwh] : []);
    const vMin = minimum(voltage);
    const vMax = maximum(voltage);
    return {
      vMin,
      vAvg: average(voltage),
      vMax,
      vVariation: vMin !== null && vMax !== null ? vMax - vMin : null,
      iAvg: average(current),
      iPeak: peakMagnitude(current),
      pAvg: average(power),
      pPeak: peakMagnitude(power),
      latestEnergy: energy.at(-1) ?? null,
      intervals: points.length,
    };
  }, [data]);

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['breaker', equipmentName],
      ['window', windowRange],
      ['timestamp', 'voltage_v', 'current_a', 'power_kw', 'energy_counter_kwh'],
      ...data.points.map((point) => [
        point.at,
        point.metrics.voltageV ?? '',
        point.metrics.currentA ?? '',
        typeof point.metrics.powerW === 'number' ? point.metrics.powerW / 1000 : '',
        point.metrics.energyKwh ?? '',
      ]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${equipmentName.replace(/[^a-z0-9_-]+/gi, '-')}-report-${windowRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="sm-workbench sm-load-report">
      <header className="sm-workbench-header">
        <div>
          <small>{t('breakerReportTitle')}</small>
          <h1>{equipmentName}</h1>
          <p>{context}</p>
        </div>
        <div className="sm-workbench-header-actions">
          <button type="button" onClick={() => window.location.reload()}>{t('refresh')}</button>
          <button type="button" onClick={() => window.close()}>{t('close')}</button>
        </div>
      </header>

      <div className="sm-workbench-window-tabs" aria-label={t('reportWindow')}>
        {TELEMETRY_HISTORY_WINDOWS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={windowRange === item}
            onClick={() => {
              setData(null);
              setError('');
              setWindowRange(item);
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      {error ? <p className="sm-workbench-error">{t('unavailable')}</p> : null}
      {!data && !error ? <p>{t('loading')}</p> : null}
      {data ? (
        <>
          <section>
            <h2>{t('breakerSummary')}</h2>
            <div className="sm-load-report-kpis">
              <article><small>{t('minVoltage')}</small><strong>{metric(summary.vMin, 'V')}</strong></article>
              <article><small>{t('avgVoltage')}</small><strong>{metric(summary.vAvg, 'V')}</strong></article>
              <article><small>{t('maxVoltage')}</small><strong>{metric(summary.vMax, 'V')}</strong></article>
              <article><small>{t('voltageVariation')}</small><strong>{metric(summary.vVariation, 'V')}</strong></article>
              <article><small>{t('avgCurrent')}</small><strong>{metric(summary.iAvg, 'A')}</strong></article>
              <article><small>{t('peakCurrent')}</small><strong>{metric(summary.iPeak, 'A')}</strong></article>
              <article><small>{t('avgPower')}</small><strong>{metric(summary.pAvg, 'kW', 3)}</strong></article>
              <article><small>{t('peakPower')}</small><strong>{metric(summary.pPeak, 'kW', 3)}</strong></article>
              <article><small>{t('latestEnergy')}</small><strong>{metric(summary.latestEnergy, 'kWh', 4)}</strong></article>
              <article><small>{t('recordedIntervals')}</small><strong>{summary.intervals}</strong></article>
            </div>
          </section>

          <section className="sm-load-report-breakers">
            <header><h2>{t('history')}</h2></header>
            <div className="sm-load-report-table-wrap">
              <table>
                <thead><tr><th>{t('timestamp')}</th><th>{t('voltage')}</th><th>{t('current')}</th><th>{t('power')}</th><th>{t('energy')}</th></tr></thead>
                <tbody>
                  {data.points.map((point) => (
                    <tr key={point.at}>
                      <td>{new Date(point.at).toLocaleString(locale, { timeZone: 'America/Lima' })}</td>
                      <td>{metric(point.metrics.voltageV ?? null, 'V')}</td>
                      <td>{metric(point.metrics.currentA ?? null, 'A')}</td>
                      <td>{metric(typeof point.metrics.powerW === 'number' ? point.metrics.powerW / 1000 : null, 'kW', 3)}</td>
                      <td>{metric(point.metrics.energyKwh ?? null, 'kWh', 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="sm-load-report-actions">
            <button type="button" onClick={exportCsv}>{t('exportCsv')}</button>
            <button type="button" onClick={() => window.print()}>{t('printPdf')}</button>
          </footer>
        </>
      ) : null}
    </main>
  );
}
