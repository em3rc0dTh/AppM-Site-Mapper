'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type {
  DeclaredPowerTrace,
  DeclaredPowerTraceFeed,
} from '@/modules/power/application/declared-power-trace-service';
import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';

type TelemetryView = {
  readonly targetId: string;
  readonly status: string;
  readonly sample: TelemetrySample | null;
};

type LiveMetrics = {
  readonly status: string;
  readonly receivedAt?: string;
  readonly voltageV?: number;
  readonly currentA?: number;
  readonly powerW?: number;
  readonly energyKwh?: number;
};

function metricValue(
  reading: BreakerTelemetryReading | undefined,
  key: keyof BreakerTelemetryReading['metrics'],
): number | undefined {
  return reading?.metrics[key]?.value;
}

function liveMetrics(view: TelemetryView | null, breakerId: string): LiveMetrics {
  const reading = view?.sample?.breakerReadings?.find((item) => item.breakerId === breakerId);
  const voltageV = metricValue(reading, 'voltageV');
  const currentA = metricValue(reading, 'currentA');
  const powerW = metricValue(reading, 'powerW');
  const energyKwh = metricValue(reading, 'energyKwh');

  return {
    status: view?.status ?? 'NO_DATA',
    ...(reading?.receivedAt ? { receivedAt: reading.receivedAt } : {}),
    ...(voltageV !== undefined ? { voltageV } : {}),
    ...(currentA !== undefined ? { currentA } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
    ...(energyKwh !== undefined ? { energyKwh } : {}),
  };
}

function metric(value: number | undefined, unit: string, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)} ${unit}`;
}

function formatTime(value: string | undefined, locale: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(locale === 'es' ? 'es-PE' : 'en-US');
}

function BreakerFeedCard({
  side,
  feed,
  selected,
  metrics,
}: Readonly<{
  side: 'A' | 'B';
  feed: DeclaredPowerTraceFeed | undefined;
  selected: boolean;
  metrics: LiveMetrics | undefined;
}>) {
  const t = useTranslations('powerTraceWorkbench');

  return (
    <article
      className="sm-trace-declared-breaker"
      data-feed={side}
      data-selected={selected ? 'true' : 'false'}
    >
      <header>
        <strong>ϟ {t('feedTitle', { feed: side })}</strong>
        <span>{t('declaredFeed')}</span>
      </header>

      {feed ? (
        <>
          <div className="sm-trace-breaker-glyph" aria-hidden="true">
            ϟ
          </div>
          <strong className="sm-trace-breaker-name">{feed.breakerName}</strong>
          <dl className="sm-trace-breaker-meta">
            <div>
              <dt>{t('sourceQdf')}</dt>
              <dd>{feed.qdfName}</dd>
            </div>
            <div>
              <dt>{t('panel')}</dt>
              <dd>{feed.panelName}</dd>
            </div>
            <div>
              <dt>{t('declaredDestination')}</dt>
              <dd>{feed.targetLabel}</dd>
            </div>
          </dl>
          <div className="sm-trace-breaker-live">
            <strong>{metrics?.status ?? 'NO_DATA'}</strong>
            <span>{metric(metrics?.voltageV, 'V', 1)}</span>
            <span>{metric(metrics?.currentA, 'A')}</span>
            <span>{metric(metrics?.powerW, 'W', 1)}</span>
            <span>{metric(metrics?.energyKwh, 'kWh', 3)}</span>
          </div>
          <a
            className="sm-trace-breaker-open"
            href={'/device/' + encodeURIComponent(feed.breakerId)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('openBreaker', { breaker: feed.breakerName })}
          </a>
        </>
      ) : (
        <p className="sm-trace-empty">{t('declaredFeedMissing', { feed: side })}</p>
      )}
    </article>
  );
}

export function DeclaredPowerTraceWorkbench({
  trace,
  canReadTelemetry,
}: Readonly<{
  trace: DeclaredPowerTrace;
  canReadTelemetry: boolean;
}>) {
  const t = useTranslations('powerTraceWorkbench');
  const locale = useLocale();
  const [telemetry, setTelemetry] = useState<Record<string, LiveMetrics>>({});

  const feeds = useMemo(
    () =>
      [trace.feedA, trace.feedB].filter((feed): feed is DeclaredPowerTraceFeed => Boolean(feed)),
    [trace.feedA, trace.feedB],
  );

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      if (!canReadTelemetry) return;
      const entries = await Promise.all(
        feeds.map(async (feed) => {
          try {
            const response = await fetch(
              `/api/telemetry/entity?${new URLSearchParams({
                targetId: feed.breakerId,
                window: 'LIVE',
              })}`,
              { cache: 'no-store', signal: controller.signal },
            );
            if (!response.ok) throw new Error('LIVE_UNAVAILABLE');
            const body = (await response.json()) as TelemetryView;
            return [feed.breakerId, liveMetrics(body, feed.breakerId)] as const;
          } catch {
            return [feed.breakerId, { status: 'NO_DATA' } satisfies LiveMetrics] as const;
          }
        }),
      );

      if (!controller.signal.aborted) {
        setTelemetry(Object.fromEntries(entries));
        timer = setTimeout(load, 5000);
      }
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [canReadTelemetry, feeds]);

  const selectedFeed =
    trace.feedA?.breakerId === trace.selectedBreakerId
      ? 'A'
      : trace.feedB?.breakerId === trace.selectedBreakerId
        ? 'B'
        : undefined;

  const latestReceivedAt = feeds
    .map((feed) => telemetry[feed.breakerId]?.receivedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <main className="sm-workbench sm-power-trace-workbench" aria-label={t('aria')}>
      <header className="sm-trace-header">
        <div className="sm-trace-heading">
          <h1>ϟ {t('title')}</h1>
          <span className="sm-trace-version">{t('version')}</span>
        </div>
        <div className="sm-trace-header-actions">
          <button type="button" onClick={() => window.location.reload()}>
            {t('refresh')}
          </button>
          <button type="button" onClick={() => window.print()} title={t('pdfHelp')}>
            {t('exportPdf')}
          </button>
          <button type="button" onClick={() => window.print()}>
            {t('print')}
          </button>
        </div>
      </header>

      <section className="sm-trace-summary">
        <div>
          <strong>{trace.targetLabel}</strong>
          <span>{trace.targetKind}</span>
          <small>
            {trace.targetCanonicalEntityName}
            {trace.targetRackAid ? ` · ${trace.targetRackAid}` : ''}
          </small>
        </div>
        <p>{t('declaredCoverage', { count: feeds.length })}</p>
      </section>

      <section className="sm-trace-declared-notice">
        <strong>{t('declaredTraceTitle')}</strong>
        <span>{t('declaredTraceHelp')}</span>
      </section>

      <div className="sm-trace-visual sm-trace-declared-visual">
        <BreakerFeedCard
          side="A"
          feed={trace.feedA}
          selected={selectedFeed === 'A'}
          metrics={trace.feedA ? telemetry[trace.feedA.breakerId] : undefined}
        />

        <article className="sm-trace-destination sm-trace-declared-destination">
          <span className="sm-trace-server" aria-hidden="true">
            ▤
          </span>
          <small>{t('poweredDestination')}</small>
          <strong className="sm-trace-destination-name">{trace.targetLabel}</strong>
          <span className="sm-trace-canonical-name">{trace.targetCanonicalEntityName}</span>

          <div className="sm-trace-declared-endpoints">
            <div data-feed="A">
              <b>{t('feedTitle', { feed: 'A' })}</b>
              <span>{trace.feedA?.targetLabel ?? '—'}</span>
              {trace.feedA?.targetAid ? <code>{trace.feedA.targetAid}</code> : null}
            </div>
            <div data-feed="B">
              <b>{t('feedTitle', { feed: 'B' })}</b>
              <span>{trace.feedB?.targetLabel ?? '—'}</span>
              {trace.feedB?.targetAid ? <code>{trace.feedB.targetAid}</code> : null}
            </div>
          </div>
        </article>

        <BreakerFeedCard
          side="B"
          feed={trace.feedB}
          selected={selectedFeed === 'B'}
          metrics={trace.feedB ? telemetry[trace.feedB.breakerId] : undefined}
        />
      </div>

      {canReadTelemetry ? (
        <section className="sm-trace-section">
          <header>
            <h2>{t('telemetry')}</h2>
            <small>{t('updatedAt', { time: formatTime(latestReceivedAt, locale) })}</small>
          </header>
          <div className="sm-trace-declared-telemetry">
            {feeds.map((feed) => {
              const live = telemetry[feed.breakerId];
              return (
                <article key={feed.breakerId} data-feed={feed.feed}>
                  <header>
                    <strong>
                      {t('feedTitle', { feed: feed.feed })} · {feed.breakerName}
                    </strong>
                    <span>{live?.status ?? 'NO_DATA'}</span>
                  </header>
                  <div>
                    <b>{metric(live?.voltageV, 'V', 1)}</b>
                    <b>{metric(live?.currentA, 'A')}</b>
                    <b>{metric(live?.powerW, 'W', 1)}</b>
                    <b>{metric(live?.energyKwh, 'kWh', 3)}</b>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="sm-trace-section">
        <header>
          <h2>{t('declaredEvidence')}</h2>
        </header>
        <dl className="sm-trace-declared-evidence">
          <div>
            <dt>{t('selectedBreaker')}</dt>
            <dd>
              {selectedFeed
                ? `${selectedFeed} · ${selectedFeed === 'A' ? trace.feedA?.breakerName : trace.feedB?.breakerName}`
                : trace.selectedBreakerId}
            </dd>
          </div>
          <div>
            <dt>{t('pairId')}</dt>
            <dd>{trace.pairId ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('rackAid')}</dt>
            <dd>{trace.targetRackAid ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('selectedAid')}</dt>
            <dd>{trace.selectedTargetAid ?? '—'}</dd>
          </div>
        </dl>
        <p className="sm-trace-document-note">{t('declaredNoPhysicalPath')}</p>
      </section>
    </main>
  );
}
