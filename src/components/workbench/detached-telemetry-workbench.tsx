'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { SnmpFeedHistory } from '@/components/power/snmp-feed-history';
import { SnmpFeedLoadPanel } from '@/components/power/snmp-feed-load-panel';
import {
  TELEMETRY_HISTORY_WINDOWS,
  type TelemetryHistoryPoint,
  type TelemetryHistoryResponse,
  type TelemetryHistoryWindow,
} from '@/modules/telemetry/domain/history';

type WorkbenchView = 'snmp' | 'mqtt' | 'inputs';
type MetricKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

function valueFor(point: TelemetryHistoryPoint, key: MetricKey): number | null {
  const value = point[key];
  if (value === null) return null;
  return key === 'powerW' ? value / 1000 : value;
}

function WorkbenchChart({
  label,
  unit,
  metricKey,
  points,
}: Readonly<{
  label: string;
  unit: string;
  metricKey: MetricKey;
  points: readonly TelemetryHistoryPoint[];
}>) {
  const values = points.flatMap((point) => {
    const value = valueFor(point, metricKey);
    const time = Date.parse(point.observedAt);
    return value === null || !Number.isFinite(time) ? [] : [{ value, time }];
  });
  if (!values.length) return <div className="sm-workbench-empty">—</div>;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const width = 900;
  const height = 230;
  const first = values[0]!.time;
  const last = values.at(-1)!.time;
  const x = (time: number) => 45 + ((time - first) / (last - first || 1)) * (width - 70);
  const y = (value: number) => 18 + (1 - (value - min) / range) * (height - 55);
  const path = values
    .map((point, index) => `${index ? 'L' : 'M'} ${x(point.time).toFixed(2)} ${y(point.value).toFixed(2)}`)
    .join(' ');
  return (
    <section className="sm-workbench-chart">
      <header>
        <strong>{label}</strong>
        <span>{values.at(-1)!.value.toFixed(metricKey === 'energyKwh' ? 4 : metricKey === 'powerW' ? 3 : 2)} {unit}</span>
      </header>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line x1="45" y1="18" x2={width - 25} y2="18" />
        <line x1="45" y1={height - 37} x2={width - 25} y2={height - 37} />
        <path d={path} />
      </svg>
      <footer>
        <span>{min.toFixed(2)} {unit}</span>
        <span>{max.toFixed(2)} {unit}</span>
      </footer>
    </section>
  );
}

function MqttWorkbench({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('workbench');
  const [window, setWindow] = useState<TelemetryHistoryWindow>('24h');
  const [data, setData] = useState<TelemetryHistoryResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/telemetry/history?deviceId=${encodeURIComponent(deviceId)}&window=${window}`,
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        return response.json() as Promise<TelemetryHistoryResponse>;
      })
      .then((payload) => {
        if (!controller.signal.aborted) setData(payload);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'HISTORY_LOAD_FAILED');
      });
    return () => controller.abort();
  }, [deviceId, window]);

  const metrics = useMemo(
    () => [
      { key: 'voltageV' as const, label: t('voltage'), unit: 'V' },
      { key: 'currentA' as const, label: t('current'), unit: 'A' },
      { key: 'powerW' as const, label: t('power'), unit: 'kW' },
      { key: 'energyKwh' as const, label: t('energy'), unit: 'kWh' },
    ],
    [t],
  );

  return (
    <>
      <div className="sm-workbench-window-tabs">
        {TELEMETRY_HISTORY_WINDOWS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={window === item}
            onClick={() => {
              setError('');
              setData(null);
              setWindow(item);
            }}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>
      {error ? <p role="alert">{t('unavailable')}</p> : null}
      {!data && !error ? <p>{t('loading')}</p> : null}
      {data ? (
        <div className="sm-workbench-chart-grid">
          {metrics.map((metric) => (
            <WorkbenchChart
              key={metric.key}
              label={metric.label}
              unit={metric.unit}
              metricKey={metric.key}
              points={data.points}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function DetachedTelemetryWorkbench({
  deviceId,
  deviceName,
  chassisId,
  initialView,
}: Readonly<{
  deviceId: string;
  deviceName: string;
  chassisId: string;
  initialView: WorkbenchView;
}>) {
  const t = useTranslations('workbench');
  const [view, setView] = useState<WorkbenchView>(initialView);
  return (
    <main className="sm-workbench">
      <header className="sm-workbench-header">
        <div>
          <small>{t('detachedTitle')}</small>
          <h1>{t('telemetryTitle')}</h1>
          <p>{deviceName}</p>
        </div>
        <button type="button" onClick={() => window.close()}>{t('close')}</button>
      </header>
      <nav className="sm-workbench-nav" aria-label={t('source')}>
        <button type="button" aria-pressed={view === 'snmp'} onClick={() => setView('snmp')}>{t('snmpCharts')}</button>
        <button type="button" aria-pressed={view === 'mqtt'} onClick={() => setView('mqtt')}>{t('mqttCharts')}</button>
        <button type="button" aria-pressed={view === 'inputs'} onClick={() => setView('inputs')}>{t('inputs')}</button>
      </nav>
      <section className="sm-workbench-body">
        {view === 'snmp' ? <SnmpFeedHistory deviceId={deviceId} /> : null}
        {view === 'mqtt' ? <MqttWorkbench deviceId={deviceId} /> : null}
        {view === 'inputs' ? <SnmpFeedLoadPanel deviceId={deviceId} chassisId={chassisId} view="feeds" /> : null}
      </section>
    </main>
  );
}
