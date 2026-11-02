'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { projectQdfLoadReport, type QdfHistoricalElectricalContract } from '@/modules/telemetry/application/qdf-load-report';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';

interface TrendPayload {
  qdfElectricalContract: QdfHistoricalElectricalContract;
}

interface BreakerRow {
  id: string;
  label: string;
  panelId: string;
  panelLabel: string;
  position: number;
  bound: boolean;
  sampleCount: number;
  averageVoltageV: number | null;
  averageCurrentA: number | null;
  peakAbsCurrentA: number | null;
  averagePowerKw: number | null;
  peakAbsPowerKw: number | null;
  latestEnergyCounterKwh: number | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
}

interface BreakerPayload {
  installedBreakerCount: number;
  boundBreakerCount: number;
  reportingBreakerCount: number;
  rows: BreakerRow[];
}

function metric(value: number | null, unit: string, digits = 2): string {
  return value === null ? '—' : `${value.toFixed(digits)} ${unit}`;
}

function LoadTrend({
  points,
  label,
}: Readonly<{
  points: readonly { bucketAt: string; powerKw: number }[];
  label: string;
}>) {
  if (!points.length) return <div className="sm-workbench-empty">—</div>;
  const values = points
    .map((point) => ({ time: Date.parse(point.bucketAt), value: point.powerKw }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value));
  if (!values.length) return <div className="sm-workbench-empty">—</div>;
  const width = 1100;
  const height = 270;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const first = values[0]!.time;
  const last = values.at(-1)!.time;
  const x = (time: number) => 55 + ((time - first) / (last - first || 1)) * (width - 90);
  const y = (value: number) => 20 + (1 - (value - min) / range) * (height - 65);
  const path = values
    .map((point, index) => `${index ? 'L' : 'M'} ${x(point.time).toFixed(2)} ${y(point.value).toFixed(2)}`)
    .join(' ');
  return (
    <section className="sm-load-report-trend">
      <header><strong>{label}</strong><span>kW</span></header>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line x1="55" y1="20" x2={width - 35} y2="20" />
        <line x1="55" y1={height - 45} x2={width - 35} y2={height - 45} />
        <path d={path} />
      </svg>
      <footer><span>{min.toFixed(3)} kW</span><span>{max.toFixed(3)} kW</span></footer>
    </section>
  );
}

export function QdfLoadReportWorkbench({
  deviceId,
  deviceName,
  location,
  initialWindow,
}: Readonly<{
  deviceId: string;
  deviceName: string;
  location: string;
  initialWindow: TelemetryHistoryWindow;
}>) {
  const t = useTranslations('workbench');
  const [windowRange, setWindowRange] = useState<TelemetryHistoryWindow>(initialWindow);
  const [trends, setTrends] = useState<TrendPayload | null>(null);
  const [breakers, setBreakers] = useState<BreakerPayload | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setTrends(null);
    setBreakers(null);
    const query = `deviceId=${encodeURIComponent(deviceId)}&window=${windowRange}`;
    void Promise.all([
      fetch(`/api/telemetry/snmp/feeds/trends?${query}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/telemetry/qdf/load-report?${query}`, { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([trendResponse, breakerResponse]) => {
        if (!trendResponse.ok || !breakerResponse.ok) {
          throw new Error(`HTTP_${trendResponse.status}_${breakerResponse.status}`);
        }
        return Promise.all([
          trendResponse.json() as Promise<TrendPayload>,
          breakerResponse.json() as Promise<BreakerPayload>,
        ]);
      })
      .then(([trendPayload, breakerPayload]) => {
        if (!controller.signal.aborted) {
          setTrends(trendPayload);
          setBreakers(breakerPayload);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'LOAD_REPORT_FAILED');
      });
    return () => controller.abort();
  }, [deviceId, refresh, windowRange]);

  const report = useMemo(
    () => (trends ? projectQdfLoadReport(trends.qdfElectricalContract) : null),
    [trends],
  );

  function exportCsv() {
    if (!report || !breakers) return;
    const rows = [
      ['device', deviceName],
      ['window', report.window],
      ['contract_status', report.status],
      ['average_voltage_v', report.metrics.voltage.average ?? ''],
      ['peak_current_a', report.metrics.current.peak ?? ''],
      ['average_power_kw', report.metrics.power.average ?? ''],
      ['peak_power_kw', report.metrics.power.peak ?? ''],
      ['energy_kwh', report.metrics.energy.total ?? ''],
      [],
      ['panel', 'position', 'breaker', 'avg_voltage_v', 'avg_current_a', 'peak_abs_current_a', 'avg_power_kw', 'peak_abs_power_kw', 'latest_energy_counter_kwh', 'samples'],
      ...breakers.rows.map((row) => [
        row.panelLabel,
        row.position,
        row.label,
        row.averageVoltageV ?? '',
        row.averageCurrentA ?? '',
        row.peakAbsCurrentA ?? '',
        row.averagePowerKw ?? '',
        row.peakAbsPowerKw ?? '',
        row.latestEnergyCounterKwh ?? '',
        row.sampleCount,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${deviceName.replace(/[^a-z0-9_-]+/gi, '-')}-load-report-${windowRange}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const contract = trends?.qdfElectricalContract;
  return (
    <main className="sm-workbench sm-load-report">
      <header className="sm-workbench-header">
        <div>
          <small>{t('detachedTitle')}</small>
          <h1>{t('loadReportTitle')} · {deviceName}</h1>
          <p>{location}</p>
        </div>
        <div className="sm-workbench-header-actions">
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>{t('refresh')}</button>
          <button type="button" onClick={() => window.close()}>{t('close')}</button>
        </div>
      </header>

      <div className="sm-workbench-window-tabs" aria-label={t('reportWindow')}>
        {TELEMETRY_HISTORY_WINDOWS.map((item) => (
          <button key={item} type="button" aria-pressed={windowRange === item} onClick={() => setWindowRange(item)}>
            {item.toUpperCase()}
          </button>
        ))}
      </div>

      {error ? <p className="sm-workbench-error" role="alert">{t('unavailable')}</p> : null}
      {!report && !error ? <p>{t('loading')}</p> : null}

      {report && contract && breakers ? (
        <>
          <section className="sm-load-report-meta">
            <span><b>{t('generatedFrom')}</b> {report.sourceContractVersion}</span>
            <span><b>{t('contractStatus')}</b> {report.status}</span>
            <span><b>{t('firstAccepted')}</b> {report.firstAcceptedAt ?? '—'}</span>
            <span><b>{t('lastAccepted')}</b> {report.lastAcceptedAt ?? '—'}</span>
          </section>

          <section>
            <h2>{t('summary')}</h2>
            <div className="sm-load-report-kpis">
              <article><small>{t('peakPower')}</small><strong>{metric(report.metrics.power.peak, 'kW', 3)}</strong></article>
              <article><small>{t('avgPower')}</small><strong>{metric(report.metrics.power.average, 'kW', 3)}</strong></article>
              <article><small>{t('peakCurrent')}</small><strong>{metric(report.metrics.current.peak, 'A')}</strong></article>
              <article><small>{t('totalEnergy')}</small><strong>{metric(report.metrics.energy.total, 'kWh', 4)}</strong></article>
              <article><small>{t('avgVoltage')}</small><strong>{metric(report.metrics.voltage.average, 'V')}</strong></article>
              <article><small>{t('commonBuckets')}</small><strong>{report.coverage.commonBuckets}</strong></article>
            </div>
          </section>

          <LoadTrend points={contract.metrics.power.points} label={t('power')} />

          <section className="sm-load-report-quality">
            <h2>{t('metricQuality')}</h2>
            <div>
              <span>{t('voltage')}<b>{report.metrics.voltage.quality}</b></span>
              <span>{t('current')}<b>{report.metrics.current.quality}</b></span>
              <span>{t('power')}<b>{report.metrics.power.quality}</b></span>
              <span>{t('energy')}<b>{report.metrics.energy.quality}</b></span>
            </div>
          </section>

          <section className="sm-load-report-breakers">
            <header>
              <div>
                <h2>{t('breakerDistribution')}</h2>
                <p>{t('canonicalNote')}</p>
              </div>
              <span>{breakers.reportingBreakerCount} / {breakers.installedBreakerCount} {t('reportingBreakers')}</span>
            </header>
            <div className="sm-load-report-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('panel')}</th>
                    <th>{t('position')}</th>
                    <th>{t('breaker')}</th>
                    <th>{t('avgVoltage')}</th>
                    <th>{t('avgCurrent')}</th>
                    <th>{t('peakCurrent')}</th>
                    <th>{t('avgPower')}</th>
                    <th>{t('peakPower')}</th>
                    <th>{t('latestEnergyCounter')}</th>
                    <th>{t('samples')}</th>
                  </tr>
                </thead>
                <tbody>
                  {breakers.rows.map((row) => (
                    <tr key={row.id} data-reporting={row.sampleCount > 0}>
                      <td>{row.panelLabel}</td>
                      <td>{row.position}</td>
                      <td>{row.label}</td>
                      <td>{metric(row.averageVoltageV, 'V')}</td>
                      <td>{metric(row.averageCurrentA, 'A')}</td>
                      <td>{metric(row.peakAbsCurrentA, 'A')}</td>
                      <td>{metric(row.averagePowerKw, 'kW', 3)}</td>
                      <td>{metric(row.peakAbsPowerKw, 'kW', 3)}</td>
                      <td>{metric(row.latestEnergyCounterKwh, 'kWh', 4)}</td>
                      <td>{row.sampleCount}</td>
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
