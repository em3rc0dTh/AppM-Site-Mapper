'use client';

import { useState } from 'react';

import type {
  FullPowerTrace,
  FullPowerTraceLeg,
} from '@/modules/power/application/full-power-trace-service';

function metric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function TraceLeg({ leg }: Readonly<{ leg: FullPowerTraceLeg }>) {
  const sourcePath = [
    leg.source.entityName,
    leg.source.shelf,
    leg.source.frame,
    leg.source.panel,
    leg.source.breaker,
  ]
    .filter(Boolean)
    .join(' › ');

  return (
    <article className="full-power-trace-leg" data-status={leg.topologyStatus}>
      <header>
        <div>
          <small>{leg.label ?? leg.pathId}</small>
          <strong>{leg.target.entityName}</strong>
        </div>
        <span>{leg.topologyStatus.replaceAll('_', ' ')}</span>
      </header>

      <div className="full-power-trace-route">
        <div>
          <small>Source circuit</small>
          <strong>{sourcePath || leg.source.entityName}</strong>
          <code>{leg.telemetry.rawPointId ?? 'No telemetry mapping'}</code>
        </div>
        <b aria-hidden="true">→</b>
        <div>
          <small>Target</small>
          <strong>{leg.target.hierarchy.join(' › ')}</strong>
          <code>
            {leg.target.accessPort
              ? `${leg.target.accessPort.label}${leg.target.accessPort.feed ? ` · FEED ${leg.target.accessPort.feed}` : ''}`
              : 'Legacy path without AccessPort'}
          </code>
        </div>
      </div>

      <dl className="full-power-trace-metrics">
        <div>
          <dt>Telemetry</dt>
          <dd>{leg.telemetry.status}</dd>
        </div>
        <div>
          <dt>Voltage</dt>
          <dd>{metric(leg.telemetry.voltageV, 'V')}</dd>
        </div>
        <div>
          <dt>Current</dt>
          <dd>{metric(leg.telemetry.currentA, 'A')}</dd>
        </div>
        <div>
          <dt>Power</dt>
          <dd>{metric(leg.telemetry.powerW, 'W')}</dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>{metric(leg.telemetry.energyKwh, 'kWh', 4)}</dd>
        </div>
      </dl>
    </article>
  );
}

function FeedColumn({
  feed,
  legs,
}: Readonly<{ feed: 'A' | 'B'; legs: readonly FullPowerTraceLeg[] }>) {
  return (
    <section className="full-power-trace-feed" data-feed={feed}>
      <header>
        <span>FEED {feed}</span>
        <strong>
          {legs.length} configured trace{legs.length === 1 ? '' : 's'}
        </strong>
      </header>
      {legs.length ? (
        legs.map((leg) => <TraceLeg key={leg.pathId} leg={leg} />)
      ) : (
        <div className="full-power-trace-empty">No configured Feed {feed} path.</div>
      )}
    </section>
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
            className="full-power-trace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="full-power-trace-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="full-power-trace-header">
              <div>
                <small>POWER / TRACE</small>
                <h2 id="full-power-trace-title">{trace?.root.name ?? 'Full Power Trace'}</h2>
                <p>
                  Feed A and Feed B are resolved independently. Redundancy is only reported when a
                  policy is explicitly configured.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close full power trace"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            {loading ? (
              <div className="full-power-trace-state">Resolving physical power paths…</div>
            ) : null}
            {error ? <div className="full-power-trace-state is-error">{error}</div> : null}

            {trace ? (
              <>
                <div className="full-power-trace-feeds">
                  <FeedColumn feed="A" legs={trace.feedA} />
                  <FeedColumn feed="B" legs={trace.feedB} />
                </div>

                {trace.unspecified.length ? (
                  <section className="full-power-trace-unspecified">
                    <h3>Feed not classified</h3>
                    {trace.unspecified.map((leg) => (
                      <TraceLeg key={leg.pathId} leg={leg} />
                    ))}
                  </section>
                ) : null}

                <section className="full-power-trace-policy">
                  <h3>Redundancy policy</h3>
                  {trace.policies.map((policy) => (
                    <div key={policy.entityId}>
                      <strong>{policy.entityName}</strong>
                      <span>{policy.policy.replaceAll('_', ' ')}</span>
                      <b data-status={policy.status}>{policy.status.replaceAll('_', ' ')}</b>
                      <code>
                        {policy.feedsPresent.length
                          ? policy.feedsPresent.join(' + ')
                          : 'No valid feeds'}
                      </code>
                    </div>
                  ))}
                </section>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
