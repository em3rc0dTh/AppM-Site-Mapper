'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type {
  FullPowerTrace,
  FullPowerTraceLeg,
  PowerTracePolicyStatus,
} from '@/modules/power/application/full-power-trace-service';

function metric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function statusLabel(leg: FullPowerTraceLeg | undefined): string {
  if (!leg) return 'NOT CONFIGURED';
  if (leg.topologyStatus !== 'VALID') return leg.topologyStatus.replaceAll('_', ' ');
  return leg.telemetry.status;
}

function FeedBadge({ feed }: Readonly<{ feed: 'A' | 'B' }>) {
  return (
    <span className="trace-feed-badge" data-feed={feed}>
      {feed}
    </span>
  );
}

function SourceCard({
  feed,
  leg,
}: Readonly<{ feed: 'A' | 'B'; leg: FullPowerTraceLeg | undefined }>) {
  const t = useTranslations('fullTrace');
  return (
    <article className="trace-source-card" data-feed={feed} data-empty={leg ? 'false' : 'true'}>
      <header>
        <span>{t('source', { feed })}</span>
        <FeedBadge feed={feed} />
      </header>
      <strong>{leg?.source.entityName ?? t('feedUnconfigured', { feed })}</strong>
      <small>{leg?.source.panel ? t('panel', { name: leg.source.panel }) : t('noPanel')}</small>
      <small>{leg?.source.breaker ? t('cb', { name: leg.source.breaker }) : t('noBreaker')}</small>
      {leg?.source.breakerSerialNumber ? (
        <small>{t('breakerSerial', { serial: leg.source.breakerSerialNumber })}</small>
      ) : null}
    </article>
  );
}

function TelemetryCard({
  feed,
  leg,
}: Readonly<{ feed: 'A' | 'B'; leg: FullPowerTraceLeg | undefined }>) {
  const t = useTranslations('fullTrace');
  return (
    <article
      className="trace-telemetry-card"
      data-feed={feed}
      data-live={leg?.telemetry.status === 'LIVE'}
    >
      <header>
        <span>ϟ</span>
        <small>{t('live', { feed })}</small>
      </header>
      <div>
        <strong>{metric(leg?.telemetry.voltageV, 'V')}</strong>
        <strong>{metric(leg?.telemetry.currentA, 'A')}</strong>
        <strong>{metric(leg?.telemetry.energyKwh, 'kWh', 4)}</strong>
      </div>
      <small>{leg?.telemetry.sourceIdentity ?? leg?.telemetry.rawPointId ?? t('noMqtt')}</small>
    </article>
  );
}

function DestinationCard({
  trace,
  feedA,
  feedB,
}: Readonly<{
  trace: FullPowerTrace;
  feedA: FullPowerTraceLeg | undefined;
  feedB: FullPowerTraceLeg | undefined;
}>) {
  const portA = feedA?.target.accessPort;
  const portB = feedB?.target.accessPort;
  return (
    <article className="trace-device-card">
      <span className="trace-device-glyph">▤</span>
      <strong>{trace.root.name}</strong>
      <small>{trace.root.kind}</small>
      <div className="trace-device-ports">
        <span data-feed="A">
          <b>●</b>
          <em>{portA?.label ?? 'POWER-IN-A'}</em>
        </span>
        <span data-feed="B">
          <b>●</b>
          <em>{portB?.label ?? 'POWER-IN-B'}</em>
        </span>
      </div>
    </article>
  );
}

function TraceStep({
  index,
  label,
  value,
  detail,
  status,
}: Readonly<{
  index: number;
  label: string;
  value: string;
  detail: string | undefined;
  status: string;
}>) {
  return (
    <div className="trace-step">
      <span className="trace-step-index">{index}</span>
      <span className="trace-step-icon">◇</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail ? <em>{detail}</em> : null}
      </div>
      <b>{status}</b>
    </div>
  );
}

function FeedTrace({
  feed,
  leg,
}: Readonly<{ feed: 'A' | 'B'; leg: FullPowerTraceLeg | undefined }>) {
  const t = useTranslations('fullTrace');
  if (!leg) {
    return (
      <section className="trace-detail-column" data-feed={feed}>
        <header>
          <div>
            <FeedBadge feed={feed} />
            <strong>{t('trace', { feed })}</strong>
          </div>
          <span className="trace-status-badge is-missing">{t('notConfigured')}</span>
        </header>
        <div className="trace-empty-column">{t('emptyPath', { feed })}</div>
      </section>
    );
  }

  const targetPort = leg.target.accessPort;
  const telemetry = [
    metric(leg.telemetry.voltageV, 'V'),
    metric(leg.telemetry.currentA, 'A'),
    metric(leg.telemetry.energyKwh, 'kWh', 4),
  ].join(' · ');

  return (
    <section className="trace-detail-column" data-feed={feed}>
      <header>
        <div>
          <FeedBadge feed={feed} />
          <strong>{t('trace', { feed })}</strong>
        </div>
        <span
          className="trace-status-badge"
          data-ok={leg.topologyStatus === 'VALID' ? 'true' : 'false'}
        >
          {leg.topologyStatus === 'VALID' ? t('verified') : leg.topologyStatus.replaceAll('_', ' ')}
        </span>
      </header>

      <TraceStep
        index={1}
        label={t('sourceDevice')}
        value={leg.source.entityName}
        detail={
          leg.source.deviceSerialNumber
            ? t('deviceSerial', { serial: leg.source.deviceSerialNumber })
            : t('deviceNoSerial')
        }
        status={t('recorded')}
      />
      <TraceStep
        index={2}
        label={t('side')}
        value={leg.source.shelf ?? '—'}
        detail={leg.source.frame}
        status={t('active')}
      />
      <TraceStep
        index={3}
        label={t('panelLabel')}
        value={leg.source.panel ?? '—'}
        detail={leg.telemetry.rawPointId}
        status={t('active')}
      />
      <TraceStep
        index={4}
        label={t('circuitBreaker')}
        value={leg.source.breaker ?? '—'}
        detail={
          leg.source.breakerSerialNumber
            ? t('breakerSerialDetail', {
                serial: leg.source.breakerSerialNumber,
                id: leg.source.breakerId ?? '—',
              })
            : t('breakerNoSerial', { id: leg.source.breakerId ?? '—' })
        }
        status={leg.telemetry.status}
      />
      <TraceStep
        index={5}
        label={t('electrical')}
        value={leg.label ?? leg.pathId}
        detail={t('feedDetail', { feed })}
        status={leg.topologyStatus === 'VALID' ? t('valid') : t('invalid')}
      />
      <TraceStep
        index={6}
        label={t('telemetry')}
        value={telemetry}
        detail={
          leg.telemetry.sourceIdentity
            ? `${t('mqttSerial', { identity: leg.telemetry.sourceIdentity })}${leg.telemetry.rawPointId ? t('rawPoint', { point: leg.telemetry.rawPointId }) : ''}${leg.telemetry.receivedAt ? t('receivedAt', { time: leg.telemetry.receivedAt }) : ''}`
            : t('noBreakerBinding')
        }
        status={leg.telemetry.status}
      />
      <TraceStep
        index={7}
        label={t('port')}
        value={targetPort?.label ?? t('legacy')}
        detail={targetPort?.id}
        status={targetPort ? t('connected') : t('missing')}
      />
      <TraceStep
        index={8}
        label={t('destination')}
        value={leg.target.entityName}
        detail={leg.target.hierarchy.join(' › ')}
        status={t('present')}
      />
    </section>
  );
}

function findPolicy(trace: FullPowerTrace): PowerTracePolicyStatus | undefined {
  return (
    trace.policies.find((policy) => policy.entityId === trace.root.id) ??
    trace.policies.find((policy) => policy.policy === 'A_B_REQUIRED')
  );
}

export function FullPowerTraceModal({
  entityId,
  selectedPathId,
  label = 'ϟ FULL POWER TRACE',
}: Readonly<{ entityId: string; selectedPathId?: string; label?: string }>) {
  const t = useTranslations('fullTrace');
  const [open, setOpen] = useState(false);
  const [trace, setTrace] = useState<FullPowerTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!trace) return null;
    const selected = selectedPathId
      ? trace.legs.find((leg) => leg.pathId === selectedPathId)
      : undefined;
    const feedA =
      selected?.feed === 'A' ? selected : trace.feedA.find((leg) => leg.pathId !== selectedPathId);
    const feedB =
      selected?.feed === 'B' ? selected : trace.feedB.find((leg) => leg.pathId !== selectedPathId);
    const policy = findPolicy(trace);
    const topologyVerified =
      Boolean(feedA && feedB) &&
      feedA?.topologyStatus === 'VALID' &&
      feedB?.topologyStatus === 'VALID';
    const telemetryVerified =
      feedA?.telemetry.status === 'LIVE' && feedB?.telemetry.status === 'LIVE';
    const redundancyVerified = policy?.policy === 'A_B_REQUIRED' && policy.status === 'SATISFIED';

    return {
      feedA,
      feedB,
      policy,
      topologyVerified,
      telemetryVerified,
      redundancyVerified,
      verified: topologyVerified && telemetryVerified && redundancyVerified,
    };
  }, [trace, selectedPathId]);

  async function openTrace() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/power-trace/${encodeURIComponent(entityId)}`, {
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => null)) as {
        trace?: FullPowerTrace;
        error?: string;
      } | null;
      if (!response.ok || !payload?.trace) {
        setError(payload?.error ?? `Unable to resolve power trace (HTTP ${response.status}).`);
        return;
      }
      setTrace(payload.trace);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="mk-primary" onClick={openTrace}>
        {label}
      </button>

      {open ? (
        <div
          className="full-power-trace-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="full-power-trace-dialog trace-reference-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="full-power-trace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="trace-reference-header">
              <div className="trace-reference-title">
                <span className="trace-pulse">ϟ</span>
                <div>
                  <h2 id="full-power-trace-title">{t('pathTitle')}</h2>
                  <small>{t('subtitle')}</small>
                </div>
              </div>
              <div className="trace-reference-summary">
                <b className={view?.verified ? 'is-ok' : ''}>
                  {view?.verified ? t('verifiedBadge') : t('incomplete')}
                </b>
                <span>
                  {t('redundancy')} <strong>A + B</strong>
                </span>
                <span>
                  {t('audit')} <strong>{view?.verified ? t('nominal') : t('review')}</strong>
                </span>
              </div>
              <button type="button" aria-label={t('close')} onClick={() => setOpen(false)}>
                ×
              </button>
            </header>

            {loading ? <div className="full-power-trace-state">{t('loading')}</div> : null}
            {error ? <div className="full-power-trace-state is-error">{error}</div> : null}

            {trace && view ? (
              <>
                <section className="trace-reference-overview">
                  <div className="trace-overview-side" data-feed="A">
                    <SourceCard feed="A" leg={view.feedA} />
                    <TelemetryCard feed="A" leg={view.feedA} />
                    <div className="trace-circuit-chip">
                      <span>{view.feedA?.source.panel ?? 'Panel A'}</span>
                      <b>→</b>
                      <span>{view.feedA?.source.breaker ?? 'Breaker A'}</span>
                    </div>
                  </div>

                  <DestinationCard trace={trace} feedA={view.feedA} feedB={view.feedB} />

                  <div className="trace-overview-side" data-feed="B">
                    <TelemetryCard feed="B" leg={view.feedB} />
                    <SourceCard feed="B" leg={view.feedB} />
                    <div className="trace-circuit-chip">
                      <span>{view.feedB?.source.breaker ?? 'Breaker B'}</span>
                      <b>→</b>
                      <span>{view.feedB?.source.panel ?? 'Panel B'}</span>
                    </div>
                  </div>
                </section>

                <section className="trace-detail-grid">
                  <FeedTrace feed="A" leg={view.feedA} />
                  <FeedTrace feed="B" leg={view.feedB} />
                </section>

                <footer className="trace-reference-footer">
                  <article>
                    <small>{t('redundancyStatus')}</small>
                    <strong>{view.redundancyVerified ? t('double') : t('notVerified')}</strong>
                    <span>
                      {view.policy?.policy === 'A_B_REQUIRED' ? t('independent') : t('undeclared')}
                    </span>
                  </article>
                  <article>
                    <small>{t('validation')}</small>
                    <strong>
                      {view.topologyVerified && view.telemetryVerified ? t('passed') : t('pending')}
                    </strong>
                    <span>{t('evaluation')}</span>
                  </article>
                  <article>
                    <small>{t('sources')}</small>
                    <strong>
                      {view.feedA?.telemetry.sourceIdentity ?? '—'} +{' '}
                      {view.feedB?.telemetry.sourceIdentity ?? '—'}
                    </strong>
                    <span>{t('noSimulation')}</span>
                  </article>
                </footer>

                {trace.unspecified.length ? (
                  <section className="full-power-trace-unspecified">
                    <h3>{t('legacyPaths')}</h3>
                    {trace.unspecified.map((leg) => (
                      <div key={leg.pathId} className="trace-legacy-row">
                        <strong>{leg.target.entityName}</strong>
                        <span>{leg.source.entityName}</span>
                        <code>{statusLabel(leg)}</code>
                      </div>
                    ))}
                  </section>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
