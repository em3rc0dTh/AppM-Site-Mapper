'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import { CompositionHistoryCharts } from '@/components/equipment/composition-history-charts';

import { breakerTelemetryMetrics, telemetryMetrics } from './telemetry-presentation';

function isTelemetrySample(value: unknown): value is TelemetrySample {
  return (
    value !== null &&
    typeof value === 'object' &&
    'entityId' in value &&
    typeof value.entityId === 'string' &&
    'receivedAt' in value &&
    typeof value.receivedAt === 'string' &&
    'reported' in value &&
    Boolean(value.reported) &&
    typeof value.reported === 'object'
  );
}

function scalar(value: unknown, candidates: readonly string[], depth = 0): number | undefined {
  if (depth > 6 || value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(record)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (candidates.includes(normalized)) {
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (item && typeof item === 'object') {
        const nested = item as Record<string, unknown>;
        if (typeof nested.value === 'number' && Number.isFinite(nested.value)) return nested.value;
      }
    }
  }
  for (const item of Object.values(record)) {
    const found = scalar(item, candidates, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function fallbackBreakerMetrics(sample: TelemetrySample) {
  const voltage = scalar(sample.reported, ['voltage', 'voltagev', 'u', 'v']);
  const current = scalar(sample.reported, ['current', 'currenta', 'i', 'a']);
  const powerW = scalar(sample.reported, ['power', 'powerw', 'p', 'w']);
  const energy = scalar(sample.reported, ['energy', 'energykwh', 'e', 'ep', 'kwh']);
  return [
    ...(voltage === undefined ? [] : [{ label: 'Voltage', value: voltage.toFixed(2), unit: 'V' }]),
    ...(current === undefined ? [] : [{ label: 'Current', value: current.toFixed(2), unit: 'A' }]),
    ...(powerW === undefined
      ? []
      : [{ label: 'Power', value: (powerW / 1000).toFixed(3), unit: 'kW' }]),
    ...(energy === undefined ? [] : [{ label: 'Energy', value: energy.toFixed(4), unit: 'kWh' }]),
  ];
}

export function TelemetryLens({
  entityIds,
  label,
  breakerId,
}: {
  entityIds: readonly string[];
  label: string;
  breakerId?: string | undefined;
}) {
  const tu = useTranslations('lensExtra');
  const t = useTranslations('telemetryLens');
  const th = useTranslations('historyCharts');
  const [open, setOpen] = useState(false);
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(0);
  const key = entityIds.join('|');

  useEffect(() => {
    if (!open) return;

    const stream = new EventSource('/api/telemetry/stream');

    const snapshot = (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (Array.isArray(data)) {
          setSamples(
            data.filter(isTelemetrySample).filter((sample) => entityIds.includes(sample.entityId)),
          );
        }
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    const incoming = (event: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(event.data);
        if (isTelemetrySample(data) && entityIds.includes(data.entityId)) {
          setSamples((current) => [
            ...current.filter((sample) => sample.entityId !== data.entityId),
            data,
          ]);
        }
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    stream.addEventListener('snapshot', snapshot as EventListener);
    stream.addEventListener('telemetry', incoming as EventListener);
    stream.onerror = () => setConnected(false);

    const clock = setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      stream.close();
      clearInterval(clock);
    };
    // Serialized IDs define the subscription context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  return (
    <section className={`mk-lens zip-telemetry-lens ${open ? 'is-open' : ''}`}>
      <div className="mk-lens-switch">
        <button aria-pressed={!open} onClick={() => setOpen(false)}>
          {tu('physical')}
        </button>
        <button aria-pressed={open} onClick={() => setOpen(true)}>
          {tu('telemetry')}
        </button>
      </div>

      {open && (
        <div className="zip-telemetry-overlay">
          <div className="mk-diagnostic zip-telemetry-diagnostic">
            <header>
              <div>
                <small>{t('context')}</small>
                <h2>{label}</h2>
              </div>
              <div className="zip-telemetry-status">
                <span>{connected ? t('connected') : t('reconnecting')}</span>
                <button
                  type="button"
                  className="zip-telemetry-close"
                  onClick={() => setOpen(false)}
                  aria-label={t('close')}
                >
                  ×
                </button>
              </div>
            </header>

            {!samples.length ? (
              <p>{t('offline')}</p>
            ) : (
              samples.map((sample) => {
                const age = now === 0 ? 0 : now - Date.parse(sample.receivedAt);
                const state =
                  !connected || age > 300_000 ? 'OFFLINE' : age > 30_000 ? 'STALE' : 'LIVE';
                const reading = sample.breakerReadings?.find(
                  (item) => item.breakerId === breakerId,
                );
                const metrics = breakerId
                  ? reading
                    ? breakerTelemetryMetrics(reading)
                    : fallbackBreakerMetrics(sample)
                  : telemetryMetrics(sample.reported);

                return (
                  <article key={sample.entityId}>
                    <header>
                      <strong>{sample.sourceIdentity}</strong>
                      <span data-state={state}>
                        {state === 'LIVE'
                          ? tu('live')
                          : state === 'STALE'
                            ? tu('stale')
                            : tu('offline')}
                      </span>
                    </header>
                    <time>{sample.receivedAt}</time>
                    <div className="mk-live-grid">
                      {metrics.map((metric) => (
                        <div key={metric.label}>
                          <small>
                            {metric.label === 'Voltage'
                              ? th('metricVoltage')
                              : metric.label === 'Current'
                                ? th('metricCurrent')
                                : metric.label === 'Power'
                                  ? th('metricPower')
                                  : metric.label === 'Energy'
                                    ? th('metricEnergy')
                                    : metric.label}
                          </small>
                          <strong>
                            {metric.value} <em>{metric.unit}</em>
                          </strong>
                        </div>
                      ))}
                    </div>
                    {!metrics.length && <p>{t('empty')}</p>}
                  </article>
                );
              })
            )}

            {breakerId ? (
              <section
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: '1px solid #dbe4ef',
                }}
                aria-label={t('powerPathHistory')}
              >
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <small>{t('powerPathHistory')}</small>
                    <h3 style={{ margin: '4px 0 0' }}>{t('timeSeriesBreaker')}</h3>
                  </div>
                  <small>{t('timescale')}</small>
                </header>
                <CompositionHistoryCharts
                  equipmentId={breakerId}
                  equipmentType="CIRCUIT_BREAKER"
                  compact
                />
              </section>
            ) : null}

            <footer>{tu('footer')}</footer>
          </div>
        </div>
      )}
    </section>
  );
}
