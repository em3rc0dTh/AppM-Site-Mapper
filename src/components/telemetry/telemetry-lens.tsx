'use client';

import { useEffect, useState } from 'react';

import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

import { breakerTelemetryMetrics, telemetryMetrics } from './telemetry-presentation';

function isTelemetrySample(value: unknown): value is TelemetrySample {
  return (
    Boolean(value) &&
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

export function TelemetryLens({
  entityIds,
  label,
  breakerId,
}: {
  entityIds: readonly string[];
  label: string;
  breakerId?: string | undefined;
}) {
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
    <section className={`mk-lens ${open ? 'is-open' : ''}`}>
      <div className="mk-lens-switch">
        <button aria-pressed={!open} onClick={() => setOpen(false)}>
          PHYSICAL
        </button>
        <button aria-pressed={open} onClick={() => setOpen(true)}>
          TELEMETRY
        </button>
      </div>

      {open && (
        <div className="mk-diagnostic">
          <header>
            <div>
              <small>CONTEXTUAL DIAGNOSTIC</small>
              <h2>{label}</h2>
            </div>
            <span>{connected ? 'Stream connected' : 'Reconnecting'}</span>
          </header>

          {!samples.length ? (
            <p>OFFLINE · No measurements received for this context.</p>
          ) : (
            samples.map((sample) => {
              const age = now === 0 ? 0 : now - Date.parse(sample.receivedAt);
              const state =
                !connected || age > 300_000 ? 'OFFLINE' : age > 30_000 ? 'STALE' : 'LIVE';
              const reading = sample.breakerReadings?.find((item) => item.breakerId === breakerId);
              const metrics = breakerId
                ? reading
                  ? breakerTelemetryMetrics(reading)
                  : []
                : telemetryMetrics(sample.reported);

              return (
                <article key={sample.entityId}>
                  <header>
                    <strong>{sample.sourceIdentity}</strong>
                    <span data-state={state}>{state}</span>
                  </header>
                  <time>{sample.receivedAt}</time>
                  <div className="mk-live-grid">
                    {metrics.map((metric) => (
                      <div key={metric.label}>
                        <small>{metric.label}</small>
                        <strong>
                          {metric.value} <em>{metric.unit}</em>
                        </strong>
                      </div>
                    ))}
                  </div>
                  {!metrics.length && <p>No mapped metrics for this object.</p>}
                </article>
              );
            })
          )}

          <footer>
            Normalized measurements · freshness: live ≤30s / stale ≤5m · no simulated connectivity
          </footer>
        </div>
      )}
    </section>
  );
}