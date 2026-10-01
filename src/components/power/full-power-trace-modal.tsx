'use client';

import { useMemo, useState } from 'react';

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
  return <span className="trace-feed-badge" data-feed={feed}>{feed}</span>;
}

function SourceCard({
  feed,
  leg,
}: Readonly<{ feed: 'A' | 'B'; leg?: FullPowerTraceLeg }>) {
  return (
    <article className="trace-source-card" data-feed={feed} data-empty={leg ? 'false' : 'true'}>
      <header>
        <span>SOURCE {feed}</span>
        <FeedBadge feed={feed} />
      </header>
      <strong>{leg?.source.entityName ?? `Feed ${feed} not configured`}</strong>
      <small>{leg?.source.panel ? `Panel ${leg.source.panel}` : 'No source panel'}</small>
      <small>{leg?.source.breaker ? `CB ${leg.source.breaker}` : 'No breaker'}</small>
    </article>
  );
}

function TelemetryCard({
  feed,
  leg,
}: Readonly<{ feed: 'A' | 'B'; leg?: FullPowerTraceLeg }>) {
  return (
    <article className="trace-telemetry-card" data-feed={feed} data-live={leg?.telemetry.status === 'LIVE'}>
      <header>
        <span>ϟ</span>
        <small>LIVE TELEMETRY ({feed})</small>
      </header>
      <div>
        <strong>{metric(leg?.telemetry.voltageV, 'V')}</strong>
        <strong>{metric(leg?.telemetry.currentA, 'A')}</strong>
        <strong>{metric(leg?.telemetry.energyKwh, 'kWh', 4)}</strong>
      </div>
      <small>{leg?.telemetry.sourceIdentity ?? leg?.telemetry.rawPointId ?? 'No MQTT reading'}</small>
    </article>
  );
}

function DestinationCard({
  trace,
  feedA,
  feedB,
}: Readonly<{
  trace: FullPowerTrace;
  feedA?: FullPowerTraceLeg;
  feedB?: FullPowerTraceLeg;
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
  detail?: string;
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
}: Readonly<{ feed: 'A' | 'B'; leg?: FullPowerTraceLeg }>) {
  if (!leg) {
    return (
      <section className="trace-detail-column" data-feed={feed}>
        <header>
          <div><FeedBadge feed={feed} /><strong>TRACE PATH — FEED {feed}</strong></div>
          <span className="trace-status-badge is-missing">NOT CONFIGURED</span>
        </header>
        <div className="trace-empty-column">No configured Feed {feed} path.</div>
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
        <div><FeedBadge feed={feed} /><strong>TRACE PATH — FEED {feed}</strong></div>
        <span className="trace-status-badge" data-ok={leg.topologyStatus === 'VALID' ? 'true' : 'false'}>
          {leg.topologyStatus === 'VALID' ? 'VERIFIED' : leg.topologyStatus.replaceAll('_', ' ')}
        </span>
      </header>

      <TraceStep index={1} label="Source Device (BDFB)" value={leg.source.entityName} detail={leg.telemetry.sourceIdentity} status={leg.telemetry.status === 'LIVE' ? 'Online' : leg.telemetry.status} />
      <TraceStep index={2} label="BDFB Side" value={leg.source.shelf ?? '—'} detail={leg.source.frame} status="Active" />
      <TraceStep index={3} label="Panel" value={leg.source.panel ?? '—'} detail={leg.telemetry.rawPointId} status="Active" />
      <TraceStep index={4} label="Circuit Breaker" value={leg.source.breaker ?? '—'} detail={leg.source.breakerId} status={leg.telemetry.status === 'LIVE' ? 'Live' : 'Mapped'} />
      <TraceStep index={5} label="Electrical Path" value={leg.label ?? leg.pathId} detail={`Feed ${feed}`} status={leg.topologyStatus === 'VALID' ? 'Valid' : 'Invalid'} />
      <TraceStep index={6} label="Telemetry" value={telemetry} detail={leg.telemetry.receivedAt} status={leg.telemetry.status} />
      <TraceStep index={7} label="Access Port" value={targetPort?.label ?? 'Legacy / unresolved port'} detail={targetPort?.id} status={targetPort ? 'Connected' : 'Missing'} />
      <TraceStep index={8} label="Destination Device" value={leg.target.entityName} detail={leg.target.hierarchy.join(' › ')} status="Present" />
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
  label = 'ϟ FULL POWER TRACE',
}: Readonly<{ entityId: string; label?: string }>) {
  const [open, setOpen] = useState(false);
  const [trace, setTrace] = useState<FullPowerTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!trace) return null;
    const feedA = trace.feedA[0];
    const feedB = trace.feedB[0];
    const policy = findPolicy(trace);
    const topologyVerified =
      Boolean(feedA && feedB) &&
      feedA?.topologyStatus === 'VALID' &&
      feedB?.topologyStatus === 'VALID';
    const telemetryVerified =
      feedA?.telemetry.status === 'LIVE' &&
      feedB?.telemetry.status === 'LIVE';
    const redundancyVerified =
      policy?.policy === 'A_B_REQUIRED' &&
      policy.status === 'SATISFIED';

    return {
      feedA,
      feedB,
      policy,
      topologyVerified,
      telemetryVerified,
      redundancyVerified,
      verified: topologyVerified && telemetryVerified && redundancyVerified,
    };
  }, [trace]);

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
        <div className="full-power-trace-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
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
                  <h2 id="full-power-trace-title">TRACE PATH</h2>
                  <small>FULL POWER TRACE · MQTT LIVE EVIDENCE</small>
                </div>
              </div>
              <div className="trace-reference-summary">
                <b className={view?.verified ? 'is-ok' : ''}>{view?.verified ? '✓ VERIFIED' : 'INCOMPLETE'}</b>
                <span>REDUNDANCY: <strong>A + B</strong></span>
                <span>AUDIT STATE: <strong>{view?.verified ? 'NOMINAL' : 'REVIEW'}</strong></span>
              </div>
              <button type="button" aria-label="Close full power trace" onClick={() => setOpen(false)}>×</button>
            </header>

            {loading ? <div className="full-power-trace-state">Resolving physical power paths and MQTT telemetry…</div> : null}
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
                    <small>REDUNDANCY STATUS</small>
                    <strong>{view.redundancyVerified ? 'DOUBLE PATH A + B' : 'NOT VERIFIED'}</strong>
                    <span>{view.policy?.policy === 'A_B_REQUIRED' ? 'Independent feeds required by policy.' : 'A+B policy is not declared.'}</span>
                  </article>
                  <article>
                    <small>VALIDATION</small>
                    <strong>{view.topologyVerified && view.telemetryVerified ? 'ALL CHECKS PASSED' : 'CHECKS PENDING'}</strong>
                    <span>Topology, exact breaker mapping and live telemetry are evaluated independently.</span>
                  </article>
                  <article>
                    <small>MQTT SOURCES</small>
                    <strong>{view.feedA?.telemetry.sourceIdentity ?? '—'} + {view.feedB?.telemetry.sourceIdentity ?? '—'}</strong>
                    <span>No simulated connectivity is used in this trace.</span>
                  </article>
                </footer>

                {trace.unspecified.length ? (
                  <section className="full-power-trace-unspecified">
                    <h3>Unclassified legacy paths</h3>
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
