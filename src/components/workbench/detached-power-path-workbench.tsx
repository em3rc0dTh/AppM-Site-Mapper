'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { CompositionHistoryCharts } from '@/components/equipment/composition-history-charts';
import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';

type View = {
  targetId: string;
  status: string;
  sample: TelemetrySample | null;
};

type Metric = {
  key: 'voltage' | 'current' | 'power' | 'energy';
  value: string;
  unit: string;
};

function metricFromReading(
  reading: BreakerTelemetryReading | undefined,
  key: 'voltageV' | 'currentA' | 'powerW' | 'energyKwh',
): number | undefined {
  return reading?.metrics[key]?.value;
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

function liveMetrics(sample: TelemetrySample | null, breakerId: string): Metric[] {
  const reading = sample?.breakerReadings?.find((item) => item.breakerId === breakerId);
  const voltage = metricFromReading(reading, 'voltageV') ?? (sample ? scalar(sample.reported, ['voltage','voltagev','u','v']) : undefined);
  const current = metricFromReading(reading, 'currentA') ?? (sample ? scalar(sample.reported, ['current','currenta','i','a']) : undefined);
  const powerW = metricFromReading(reading, 'powerW') ?? (sample ? scalar(sample.reported, ['power','powerw','p','w']) : undefined);
  const energy = metricFromReading(reading, 'energyKwh') ?? (sample ? scalar(sample.reported, ['energy','energykwh','e','ep','kwh']) : undefined);
  return [
    { key: 'voltage', value: voltage === undefined ? '—' : voltage.toFixed(2), unit: 'V' },
    { key: 'current', value: current === undefined ? '—' : current.toFixed(2), unit: 'A' },
    { key: 'power', value: powerW === undefined ? '—' : (powerW / 1000).toFixed(3), unit: 'kW' },
    { key: 'energy', value: energy === undefined ? '—' : energy.toFixed(4), unit: 'kWh' },
  ];
}

export function DetachedPowerPathWorkbench({
  breakerId,
  sourceDevice,
  sourcePanel,
  sourceBreaker,
  target,
  feed,
}: Readonly<{
  breakerId: string;
  sourceDevice: string;
  sourcePanel: string;
  sourceBreaker: string;
  target: string;
  feed?: 'A' | 'B';
}>) {
  const t = useTranslations('pages.power');
  const th = useTranslations('historyCharts');
  const locale = useLocale();
  const [view, setView] = useState<View | null>(null);
  const [section, setSection] = useState<'telemetry' | 'history' | 'trace'>('telemetry');

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(
          `/api/telemetry/entity?${new URLSearchParams({ targetId: breakerId, window: 'LIVE' })}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('LIVE_UNAVAILABLE');
        const body = (await response.json()) as View;
        if (!controller.signal.aborted) setView(body);
      } catch {
        if (!controller.signal.aborted) setView(null);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [breakerId]);

  const metrics = useMemo(() => liveMetrics(view?.sample ?? null, breakerId), [view, breakerId]);
  const receivedAt = view?.sample?.receivedAt;
  const updated = receivedAt
    ? new Intl.DateTimeFormat(locale, {
        timeZone: 'America/Lima',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(receivedAt))
    : '—';

  return (
    <main className="sm-workbench sm-power-workbench">
      <header className="sm-workbench-header">
        <div>
          <small>SITE MAPPER · DETACHED WORKBENCH</small>
          <h1>{t('powerWindow')}</h1>
          <p>{sourceDevice} / {sourcePanel} / {sourceBreaker} → {target}</p>
        </div>
        <button type="button" onClick={() => window.close()}>
          {t('closePowerWindow')}
        </button>
      </header>

      <section className="sm-power-path-flow">
        <article className="sm-power-path-card">
          <small>{t('source')}</small>
          <div className="sm-power-cabinet" aria-hidden="true"><span/><span/><span/></div>
          <strong>{sourceDevice}</strong>
          <span>{sourcePanel}</span>
          <span>{sourceBreaker}</span>
          {feed ? <b>{t('feedSide', { side: feed })}</b> : null}
        </article>

        <section className="sm-power-path-link">
          <small>{t('electricalLink')}</small>
          <div className="sm-power-path-metrics">
            {metrics.map((metric) => (
              <div key={metric.key}>
                <span>
                  {metric.key === 'voltage'
                    ? th('metricVoltage')
                    : metric.key === 'current'
                      ? th('metricCurrent')
                      : metric.key === 'power'
                        ? th('metricPower')
                        : th('metricEnergy')}
                </span>
                <strong>{metric.value} <em>{metric.unit}</em></strong>
              </div>
            ))}
          </div>
          <div className="sm-power-path-arrow" aria-hidden="true"><i/><b>→</b></div>
          <time dateTime={receivedAt}>{t('updatedAt', { value: updated })}</time>
        </section>

        <article className="sm-power-path-card">
          <small>{t('destination')}</small>
          <div className="sm-power-target-glyph" aria-hidden="true">▤</div>
          <strong>{target}</strong>
          <span className="sm-power-declared-badge" title={t('declaredAssetTooltip')}>
            {t('declaredAsset')}
          </span>
        </article>
      </section>

      <nav className="sm-workbench-nav" aria-label={t('powerWindowActions')}>
        <button type="button" aria-pressed={section === 'telemetry'} onClick={() => setSection('telemetry')}>
          {t('windowTelemetry')}
        </button>
        <button type="button" aria-pressed={section === 'history'} onClick={() => setSection('history')}>
          {t('windowHistory')}
        </button>
        <button type="button" aria-pressed={section === 'trace'} onClick={() => setSection('trace')}>
          {t('windowFullTrace')}
        </button>
      </nav>

      {section === 'history' ? (
        <section className="sm-power-workbench-detail">
          <CompositionHistoryCharts equipmentId={breakerId} equipmentType="CIRCUIT_BREAKER" compact />
        </section>
      ) : section === 'trace' ? (
        <section className="sm-power-workbench-detail sm-power-trace">
          <strong>{sourceDevice}</strong><span>→</span><strong>{sourcePanel}</strong><span>→</span>
          <strong>{sourceBreaker}</strong><span>→</span><strong>{target}</strong>
        </section>
      ) : (
        <section className="sm-power-workbench-detail sm-power-live-status">
          <span>{t('liveMeasurements')}</span>
          <strong>{view?.status ?? '—'}</strong>
          <span>{view?.sample?.sourceIdentity ?? '—'}</span>
          <time dateTime={receivedAt}>{updated}</time>
        </section>
      )}
    </main>
  );
}
