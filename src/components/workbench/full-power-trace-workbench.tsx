'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DetachedWorkbenchButton } from '@/components/workbench/detached-workbench-button';
import type {
  FullPowerTrace,
  FullPowerTraceLeg,
} from '@/modules/power/application/full-power-trace-service';
import { classifyTelemetryFreshness } from '@/modules/telemetry/domain/telemetry-freshness';

type Feed = 'A' | 'B';
type EffectiveStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'CLOCK SKEW' | 'MAPPED' | 'UNMAPPED';

function metric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(decimals) + ' ' + unit;
}

function formatTime(value: string | undefined, locale: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(locale === 'es' ? 'es-PE' : 'en-US');
}

function effectiveStatus(leg: FullPowerTraceLeg | undefined, clock: number): EffectiveStatus {
  if (!leg || leg.telemetry.status === 'UNMAPPED') return 'UNMAPPED';
  if (leg.telemetry.status === 'MAPPED') return 'MAPPED';
  return classifyTelemetryFreshness(leg.telemetry.receivedAt ?? '', undefined, clock);
}

function TelemetryStatus({ status }: Readonly<{ status: EffectiveStatus }>) {
  const t = useTranslations('powerTraceWorkbench');
  const label = status === 'MAPPED' ? t('mapped') : status === 'UNMAPPED' ? t('unmapped') :
    status === 'CLOCK SKEW' ? t('clockSkew') : status;
  return <span className="sm-trace-status" data-status={status}>{label}</span>;
}

function FeedRoute({
  feed, legs, selectedPathId,
}: Readonly<{ feed: Feed; legs: readonly FullPowerTraceLeg[]; selectedPathId?: string }>) {
  const t = useTranslations('powerTraceWorkbench');
  return (
    <section className="sm-trace-feed" data-feed={feed} aria-label={t('routeAria', { feed })}>
      <header className="sm-trace-feed-header">
        <strong>ϟ {t('feedTitle', { feed })}</strong>
        <span>
          {legs.length === 0 ? t('noRecordedRoute') :
            legs.length === 1 ? t('routeRecorded') : t('routesRecorded', { count: legs.length })}
        </span>
      </header>
      {legs.length === 0 ? (
        <p className="sm-trace-empty">{t('noPathDetail', { feed })}</p>
      ) : legs.map((leg) => (
        <div className="sm-trace-leg" data-selected={selectedPathId === leg.pathId} key={leg.pathId}>
          <ol className="sm-trace-steps">
            <li><small>{t('source')}</small><strong>{leg.source.entityName}</strong></li>
            {leg.source.shelf || leg.source.frame ? (
              <li><small>{t('shelfFrame')}</small><strong>
                {[leg.source.shelf, leg.source.frame].filter(Boolean).join(' / ')}
              </strong></li>
            ) : null}
            {leg.source.panel ? (
              <li><small>{t('panel')}</small><strong>{leg.source.panel}</strong></li>
            ) : null}
            <li>
              <small>{t('breaker')}</small>
              {leg.source.breakerId ? (
                <a href={'/device/' + encodeURIComponent(leg.source.breakerId)}
                   target="_blank" rel="noopener noreferrer">
                  {leg.source.breaker ?? leg.source.breakerId}
                </a>
              ) : <strong>{leg.source.breaker ?? t('breakerUnknown')}</strong>}
            </li>
            <li className="sm-trace-endpoint">
              <small>{t('connection')}</small>
              <strong>
                {leg.source.accessPort?.label ?? t('sourcePortUnknown')}
                <span aria-hidden="true"> → </span>
                {leg.target.accessPort?.label ?? t('targetPortUnknown')}
              </strong>
            </li>
          </ol>
          {leg.topologyStatus !== 'VALID' ? (
            <p className="sm-trace-leg-warning">
              {t('topologyProblem', { status: leg.topologyStatus.replaceAll('_', ' ') })}
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function Destination({
  name, kind, feedA, feedB,
}: Readonly<{
  name: string; kind: string;
  feedA: readonly FullPowerTraceLeg[]; feedB: readonly FullPowerTraceLeg[];
}>) {
  const t = useTranslations('powerTraceWorkbench');
  const ports = (legs: readonly FullPowerTraceLeg[]) => [
    ...new Set(legs.map(leg => leg.target.accessPort?.label)
      .filter((value): value is string => Boolean(value))),
  ];
  const a = ports(feedA);
  const b = ports(feedB);
  return (
    <article className="sm-trace-destination">
      <span className="sm-trace-server" aria-hidden="true">▤</span>
      <strong className="sm-trace-destination-name">{name}</strong>
      <small>{kind}</small>
      <div className="sm-trace-destination-ports">
        <div data-feed="A"><b>{t('inputA')}</b><span>{a.length ? a.join(', ') : t('disconnected')}</span></div>
        <div data-feed="B"><b>{t('inputB')}</b><span>{b.length ? b.join(', ') : t('disconnected')}</span></div>
      </div>
    </article>
  );
}

function FeedTelemetry({
  feed, legs, clock,
}: Readonly<{ feed: Feed; legs: readonly FullPowerTraceLeg[]; clock: number }>) {
  const t = useTranslations('powerTraceWorkbench');
  const locale = useLocale();
  return (
    <section className="sm-trace-telemetry-feed" data-feed={feed}>
      <h3>{t('feedTitle', { feed })}</h3>
      {!legs.length ? <p className="sm-trace-empty">{t('noFeedRoute')}</p> : legs.map(leg => {
        const status = effectiveStatus(leg, clock);
        return (
          <article className="sm-trace-telemetry-leg" key={leg.pathId}>
            <div className="sm-trace-telemetry-line">
              <strong>{leg.source.breaker ?? leg.source.entityName}</strong>
              <TelemetryStatus status={status}/>
            </div>
            <div className="sm-trace-metrics">
              <div><b>{metric(leg.telemetry.voltageV, 'V')}</b><small>{t('voltage')}</small></div>
              <div><b>{metric(leg.telemetry.currentA, 'A')}</b><small>{t('current')}</small></div>
              <div><b>{metric(leg.telemetry.powerW, 'W')}</b><small>{t('power')}</small></div>
              <div><b>{metric(leg.telemetry.energyKwh, 'kWh', 3)}</b><small>{t('energy')}</small></div>
            </div>
            <div className="sm-trace-telemetry-meta">
              <span>{t('lastReading', { time: formatTime(leg.telemetry.receivedAt, locale) })}</span>
              {leg.telemetry.sourceIdentity ?
                <span>{t('mqttSource', { identity: leg.telemetry.sourceIdentity })}</span> : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ComparisonValue({
  leg, type, clock,
}: Readonly<{ leg: FullPowerTraceLeg | undefined; type: 'topology' | 'binding' | 'sample'; clock: number }>) {
  const t = useTranslations('powerTraceWorkbench');
  if (!leg) return t('noPath');
  if (type === 'topology') return leg.topologyStatus === 'VALID' ? t('recorded') : t('inconsistent');
  if (type === 'binding') return leg.telemetry.status === 'UNMAPPED' ? t('unmapped') : t('linked');
  const status = effectiveStatus(leg, clock);
  return status === 'MAPPED' || status === 'UNMAPPED' ? t('noReading') :
    status === 'CLOCK SKEW' ? t('clockSkew') : status;
}

export function FullPowerTraceWorkbench({
  entityId, entityName, kind, location, selectedPathId, canReadTelemetry,
}: Readonly<{
  entityId: string; entityName: string; kind: 'DEVICE' | 'EQUIPMENT';
  location: string; selectedPathId?: string; canReadTelemetry: boolean;
}>) {
  const t = useTranslations('powerTraceWorkbench');
  const locale = useLocale();
  const [trace, setTrace] = useState<FullPowerTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [clock, setClock] = useState(0);
  const [graphFeed, setGraphFeed] = useState<Feed>('A');

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/power-trace/' + encodeURIComponent(entityId), {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      });
      const result = await response.json() as { trace?: FullPowerTrace; error?: string };
      if (!response.ok || !result.trace) throw new Error(result.error ?? 'HTTP ' + response.status);
      if (!signal?.aborted) {
        setTrace(result.trace);
        setError('');
        setUpdatedAt(new Date().toISOString());
        setClock(Date.now());
      }
    } catch (cause: unknown) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Refresh failed');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void refresh(controller.signal), 0);
    const poll = window.setInterval(() => void refresh(controller.signal), 60_000);
    const tick = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  const feedA = useMemo(() => trace?.feedA ?? [], [trace]);
  const feedB = useMemo(() => trace?.feedB ?? [], [trace]);
  const primaryA = feedA.find(leg => leg.pathId === selectedPathId) ?? feedA[0];
  const primaryB = feedB.find(leg => leg.pathId === selectedPathId) ?? feedB[0];
  const graphLeg = graphFeed === 'A' ? primaryA : primaryB;
  const graphDeviceId = canReadTelemetry && graphLeg?.source.deviceType === 'BDFB' ?
    graphLeg.source.entityId : undefined;

  const findings = useMemo(() => {
    const messages: string[] = [];
    for (const [feed, legs] of [['A', feedA], ['B', feedB]] as const) {
      if (!legs.length) messages.push(t('findingMissingPath', { feed }));
      for (const leg of legs) {
        if (leg.topologyStatus !== 'VALID') {
          messages.push(t('findingBroken', { feed, status: leg.topologyStatus }));
        }
        if (!leg.target.accessPort) messages.push(t('findingNoPort', { feed }));
        if (canReadTelemetry && leg.telemetry.status === 'UNMAPPED') {
          messages.push(t('findingUnmapped', { feed }));
        }
        const status = effectiveStatus(leg, clock);
        if (canReadTelemetry && (status === 'STALE' || status === 'OFFLINE' || status === 'CLOCK SKEW')) {
          messages.push(t('findingStale', { feed, status: status === 'CLOCK SKEW' ? t('clockSkew') : status }));
        }
      }
    }
    if (trace?.unspecified.length) {
      messages.push(t('findingUnclassified', { count: trace.unspecified.length }));
    }
    if (primaryA && primaryB && primaryA.source.entityId === primaryB.source.entityId) {
      messages.push(t('findingSharedSource'));
    }
    return messages;
  }, [feedA, feedB, primaryA, primaryB, trace, clock, canReadTelemetry, t]);

  return (
    <main className="sm-workbench sm-power-trace-workbench" aria-label={t('aria')}>
      <header className="sm-trace-header">
        <div className="sm-trace-heading">
          <span className="sm-trace-brand">⬡ <b>{t('brand')}</b></span>
          <span className="sm-trace-heading-divider" aria-hidden="true"/>
          <h1>ϟ {t('title')}</h1>
          <span className="sm-trace-version">{t('version')}</span>
        </div>
        <div className="sm-trace-header-actions">
          <button type="button" onClick={() => void refresh()} disabled={loading && !trace}>
            {t('refresh')}
          </button>
          {canReadTelemetry && (primaryA?.source.deviceType === 'BDFB' ||
            primaryB?.source.deviceType === 'BDFB') ? (
            <select aria-label={t('graphFeedAria')} value={graphFeed}
              onChange={e => setGraphFeed(e.target.value as Feed)}>
              <option value="A">{t('graphA')}</option>
              <option value="B">{t('graphB')}</option>
            </select>
          ) : null}
          {graphDeviceId ? (
            <DetachedWorkbenchButton
              href={'/workbench/load-report?deviceId=' + encodeURIComponent(graphDeviceId) + '&window=24h'}
              windowName={'site-mapper-load-report-' + graphDeviceId}
              label={t('graph')}
            >{t('graph')}</DetachedWorkbenchButton>
          ) : null}
          <button type="button" onClick={() => window.print()} title={t('pdfHelp')}>
            {t('exportPdf')}
          </button>
          <button type="button" onClick={() => window.print()}>{t('print')}</button>
        </div>
      </header>

      <section className="sm-trace-summary">
        <div>
          <strong>{entityName}</strong>
          <span>{kind}</span>
          <small>{location || t('locationUnavailable')}</small>
        </div>
        <p>{t('coverage', { count: Number(feedA.length > 0) + Number(feedB.length > 0) })}</p>
      </section>

      {error ? <p className="sm-trace-error" role="alert">{t('error', { reason: error })}</p> : null}
      {loading && !trace ? <div className="sm-workbench-empty">{t('loading')}</div> : null}

      {trace ? (
        <>
          <div className="sm-trace-visual">
            <FeedRoute feed="A" legs={feedA} {...(selectedPathId ? { selectedPathId } : {})}/>
            <Destination name={trace.root.name} kind={trace.root.kind} feedA={feedA} feedB={feedB}/>
            <FeedRoute feed="B" legs={feedB} {...(selectedPathId ? { selectedPathId } : {})}/>
          </div>

          {canReadTelemetry ? (
            <section className="sm-trace-section">
              <header>
                <h2>{t('telemetry')}</h2>
                <small>{t('updatedAt', { time: formatTime(updatedAt, locale) })}</small>
              </header>
              <div className="sm-trace-two-col">
                <FeedTelemetry feed="A" legs={feedA} clock={clock}/>
                <FeedTelemetry feed="B" legs={feedB} clock={clock}/>
              </div>
            </section>
          ) : null}

          <div className="sm-trace-lower">
            <section className="sm-trace-section">
              <header><h2>{t('reconciliation')}</h2></header>
              <table className="sm-trace-comparison">
                <thead><tr><th>{t('reference')}</th><th>{t('feedTitle', { feed: 'A' })}</th>
                  <th>{t('feedTitle', { feed: 'B' })}</th></tr></thead>
                <tbody>
                  <tr><th>{t('document')}</th><td>{t('notLinked')}</td><td>{t('notLinked')}</td></tr>
                  <tr><th>{t('powerPath')}</th>
                    <td><ComparisonValue leg={primaryA} type="topology" clock={clock}/></td>
                    <td><ComparisonValue leg={primaryB} type="topology" clock={clock}/></td>
                  </tr>
                  {canReadTelemetry ? (
                    <>
                      <tr><th>{t('binding')}</th>
                        <td><ComparisonValue leg={primaryA} type="binding" clock={clock}/></td>
                        <td><ComparisonValue leg={primaryB} type="binding" clock={clock}/></td>
                      </tr>
                      <tr><th>{t('lastReadingTitle')}</th>
                        <td>{formatTime(primaryA?.telemetry.receivedAt, locale)}</td>
                        <td>{formatTime(primaryB?.telemetry.receivedAt, locale)}</td>
                      </tr>
                    </>
                  ) : null}
                </tbody>
              </table>
              <p className="sm-trace-document-note">{t('excelNote')}</p>
              {trace.unspecified.length ? (
                <p className="sm-trace-document-note">
                  {t('unclassifiedNote', { count: trace.unspecified.length })}
                </p>
              ) : null}
            </section>

            <div className="sm-trace-right">
              <section className="sm-trace-section">
                <header><h2>{t('findings')}</h2><span>{findings.length}</span></header>
                {findings.length ? (
                  <ul className="sm-trace-findings">
                    {findings.map((finding, index) => (
                      <li key={index} data-warning="true">⚠ {finding}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="sm-trace-none">{t('noFindings')}</p>
                )}
              </section>
              <section className="sm-trace-section sm-trace-actions">
                <header><h2>{t('actions')}</h2></header>
                <div>
                  {[primaryA, primaryB].map((leg, index) => leg?.source.breakerId ? (
                    <a href={'/device/' + encodeURIComponent(leg.source.breakerId)}
                      key={leg.pathId} target="_blank" rel="noopener noreferrer">
                      {t('openBreaker', { breaker: leg.source.breaker ?? ('Breaker ' + (index === 0 ? 'A' : 'B')) })}
                    </a>
                  ) : null)}
                  {!primaryA?.source.breakerId && !primaryB?.source.breakerId ? (
                    <span>{t('noBreakerAction')}</span>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
