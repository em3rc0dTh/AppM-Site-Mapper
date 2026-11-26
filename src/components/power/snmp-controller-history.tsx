'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  fetchControllerSignals,
  type ControllerCatalogSignal,
} from '@/modules/telemetry/application/controller-signals-client';
import {
  parseSnmpControllerProfile,
  type SnmpControllerProfile,
} from '@/modules/telemetry/domain/snmp-controller-profile';

type WindowKey = '24h' | '7d' | '15d' | '1M';
const WINDOWS: Record<WindowKey, { spanMs: number; bucketSeconds: number }> = {
  '24h': { spanMs: 24 * 60 * 60 * 1000, bucketSeconds: 120 },
  '7d': { spanMs: 7 * 24 * 60 * 60 * 1000, bucketSeconds: 900 },
  '15d': { spanMs: 15 * 24 * 60 * 60 * 1000, bucketSeconds: 1800 },
  '1M': { spanMs: 30 * 24 * 60 * 60 * 1000, bucketSeconds: 3600 },
};

type Point = { time: number; value: number };
type Metric = {
  key: 'voltage' | 'current' | 'power' | 'energy';
  label: string;
  unit: string;
  points: Point[];
  digits: number;
};

function raw(signal: ControllerCatalogSignal): unknown {
  return signal.lastObservation?.rawValue ?? signal.rawValue;
}

function normalized(
  signal: ControllerCatalogSignal,
  profile: SnmpControllerProfile,
  kind: 'current' | 'voltage',
): number | null {
  const value = raw(signal);
  const normalization = profile.balance?.normalization;
  if (typeof value !== 'number' || !Number.isFinite(value) || !normalization) return null;
  return kind === 'current'
    ? value * normalization.totalCurrentScale
    : value * normalization.voltageScale;
}

async function fetchSeries(
  signalId: string,
  window: WindowKey,
  signal?: AbortSignal,
): Promise<ControllerCatalogSignal[]> {
  const now = Date.now();
  const config = WINDOWS[window];
  const params = new URLSearchParams({
    signalId,
    from: new Date(now - config.spanMs).toISOString(),
    to: new Date(now + 1000).toISOString(),
    bucketSeconds: String(config.bucketSeconds),
  });
  const response = await fetch('/api/telemetry/industrial/series?' + params, {
    cache: 'no-store',
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const body = (await response.json()) as { observations?: ControllerCatalogSignal[] };
  return Array.isArray(body.observations) ? body.observations : [];
}

function metricPoints(
  observations: readonly ControllerCatalogSignal[],
  profile: SnmpControllerProfile,
  kind: 'current' | 'voltage',
): Point[] {
  return observations
    .flatMap((observation) => {
      const time = Date.parse(observation.observedAt ?? observation.receivedAt);
      const value = normalized(observation, profile, kind);
      return Number.isFinite(time) && value !== null ? [{ time, value }] : [];
    })
    .sort((left, right) => left.time - right.time);
}

function derivedPower(
  current: readonly Point[],
  voltage: readonly Point[],
  bucketSeconds: number,
): Point[] {
  const currentByBucket = new Map(
    current.map((point) => [Math.floor(point.time / (bucketSeconds * 1000)), point]),
  );
  const voltageByBucket = new Map(
    voltage.map((point) => [Math.floor(point.time / (bucketSeconds * 1000)), point]),
  );
  const keys = [...currentByBucket.keys()].filter((key) => voltageByBucket.has(key)).sort((a, b) => a - b);
  return keys.map((key) => {
    const amps = currentByBucket.get(key)!;
    const volts = voltageByBucket.get(key)!;
    return {
      time: Math.max(amps.time, volts.time),
      value: (Math.abs(volts.value) * amps.value) / 1000,
    };
  });
}

function cumulativeEnergy(power: readonly Point[], bucketSeconds: number): Point[] {
  let total = 0;
  const result: Point[] = [];
  for (let index = 0; index < power.length; index++) {
    const current = power[index]!;
    const previous = power[index - 1];
    if (previous) {
      const deltaHours = (current.time - previous.time) / 3_600_000;
      if (deltaHours > 0 && deltaHours <= (bucketSeconds * 2.5) / 3600) {
        total += ((previous.value + current.value) / 2) * deltaHours;
      }
    }
    result.push({ time: current.time, value: total });
  }
  return result;
}

function MetricChart({ metric }: Readonly<{ metric: Metric }>) {
  const t = useTranslations('snmpHistoryUi');
  const points = metric.points;
  if (points.length === 0)
    return (
      <article className="sm-snmp-history-chart">
        <div className="sm-snmp-history-heading">
          <strong>{metric.label}</strong>
          <small>{metric.unit}</small>
        </div>
        <p>{t('controllerEmpty')}</p>
      </article>
    );

  const width = 360;
  const height = 150;
  const left = 48;
  const top = 16;
  const right = 12;
  const bottom = 26;
  const minT = points[0]!.time;
  const maxT = points.at(-1)!.time;
  const minV = Math.min(...points.map((point) => point.value));
  const maxV = Math.max(...points.map((point) => point.value));
  const spread = Math.max(maxV - minV, Math.max(Math.abs(maxV), 1) * 0.02);
  const low = minV - spread * 0.08;
  const high = maxV + spread * 0.08;
  const x = (time: number) =>
    left + ((time - minT) / Math.max(1, maxT - minT)) * (width - left - right);
  const y = (value: number) =>
    top + ((high - value) / Math.max(Number.EPSILON, high - low)) * (height - top - bottom);
  const latest = points.at(-1)!.value;

  return (
    <article className="sm-snmp-history-chart">
      <div className="sm-snmp-history-heading">
        <strong>{metric.label}</strong>
        <small>{latest.toFixed(metric.digits)} {metric.unit}</small>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={metric.label}>
        <line x1={left} y1={height - bottom} x2={width - right} y2={height - bottom} stroke="currentColor" opacity="0.2" />
        <line x1={left} y1={top} x2={left} y2={height - bottom} stroke="currentColor" opacity="0.2" />
        <text x="2" y={top + 8} fontSize="10">{maxV.toFixed(metric.digits)}</text>
        <text x="2" y={height - bottom} fontSize="10">{minV.toFixed(metric.digits)}</text>
        {points.length > 1 ? (
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.map((point) => `${x(point.time).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')}
          />
        ) : (
          <circle cx={x(points[0]!.time)} cy={y(points[0]!.value)} r="3" fill="currentColor" />
        )}
      </svg>
    </article>
  );
}

export function SnmpControllerHistory({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('snmpHistoryUi');
  const [profile, setProfile] = useState<SnmpControllerProfile | null>(null);
  const [window, setWindow] = useState<WindowKey>('24h');
  const [currentHistory, setCurrentHistory] = useState<ControllerCatalogSignal[]>([]);
  const [voltageHistory, setVoltageHistory] = useState<ControllerCatalogSignal[]>([]);
  const [signalIds, setSignalIds] = useState<{ current: string; voltage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          '/api/telemetry/snmp/controller-profile?' + new URLSearchParams({ deviceId }),
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body = (await response.json()) as { profile: SnmpControllerProfile | null };
        const parsed = body.profile ? parseSnmpControllerProfile(body.profile) : null;
        if (!parsed?.balance?.normalization) throw new Error('SNMP_QDF_NORMALIZATION_UNAVAILABLE');
        const signals = await fetchControllerSignals(parsed.sourceIdentity, controller.signal);
        const current = signals.find((item) => item.key === parsed.balance!.totalOid);
        const voltage = signals.find((item) => item.key === parsed.balance!.voltageOid);
        if (!current || !voltage) throw new Error('SNMP_QDF_SIGNALS_UNAVAILABLE');
        if (!controller.signal.aborted) {
          setProfile(parsed);
          setSignalIds({ current: current.id, voltage: voltage.id });
          setError('');
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'SNMP_HISTORY_UNAVAILABLE');
      }
    })();
    return () => controller.abort();
  }, [deviceId]);

  useEffect(() => {
    if (!signalIds) return;
    const controller = new AbortController();
    void Promise.all([
      fetchSeries(signalIds.current, window, controller.signal),
      fetchSeries(signalIds.voltage, window, controller.signal),
    ])
      .then(([current, voltage]) => {
        if (!controller.signal.aborted) {
          setCurrentHistory(current);
          setVoltageHistory(voltage);
          setError('');
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'SNMP_HISTORY_UNAVAILABLE');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [signalIds, window]);

  const metrics = useMemo<Metric[]>(() => {
    if (!profile) return [];
    const current = metricPoints(currentHistory, profile, 'current');
    const voltage = metricPoints(voltageHistory, profile, 'voltage');
    const power = derivedPower(current, voltage, WINDOWS[window].bucketSeconds);
    const energy = cumulativeEnergy(power, WINDOWS[window].bucketSeconds);
    return [
      { key: 'voltage', label: t('qdfVoltage'), unit: 'V', points: voltage, digits: 2 },
      { key: 'current', label: t('qdfCurrent'), unit: 'A', points: current, digits: 2 },
      { key: 'power', label: t('qdfPower'), unit: 'kW', points: power, digits: 2 },
      { key: 'energy', label: t('qdfEnergy'), unit: 'kWh', points: energy, digits: 2 },
    ];
  }, [currentHistory, profile, t, voltageHistory, window]);

  return (
    <section className="zip-bdfb-live-average sm-snmp-history" aria-label={t('qdfTitle')}>
      <header>
        <strong>{t('qdfTitle')}</strong>
        <span>{t('qdfSubtitle')}</span>
      </header>

      <div className="zip-bdfb-window-tabs" role="tablist" aria-label={t('window')}>
        {(Object.keys(WINDOWS) as WindowKey[]).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={window === option}
            onClick={() => {
              setLoading(true);
              setWindow(option);
            }}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>

      {loading && <p role="status">{t('loading')}</p>}
      {error && <p role="alert" className="form-error">{t('error', { error })}</p>}
      {!loading && !error && (
        <div className="sm-snmp-history-metrics sm-snmp-history-metrics--all">
          {metrics.map((metric) => <MetricChart key={metric.key} metric={metric} />)}
        </div>
      )}
    </section>
  );
}