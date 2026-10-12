'use client';

import { useEffect, useState } from 'react';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import { TELEMETRY_HISTORY_WINDOWS } from '@/modules/telemetry/domain/history';
import { telemetryMetrics } from './telemetry-presentation';

type View = {
  targetId: string;
  status: string;
  sample: TelemetrySample | null;
  history: TelemetrySample[] | null;
};

export function EquipmentTelemetryInspector({
  targetId,
  label,
}: {
  targetId: string;
  label: string;
}) {
  const [window, setWindow] = useState('LIVE');
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(
          `/api/telemetry/entity?${new URLSearchParams({ targetId, window })}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'TELEMETRY_UNAVAILABLE');
        if (!controller.signal.aborted) {
          setView(body);
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'TELEMETRY_UNAVAILABLE');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (window === 'LIVE') timer = setTimeout(load, 5000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [targetId, window]);
  const current = view?.targetId === targetId ? view : null;
  const samples =
    loading || error
      ? []
      : window === 'LIVE'
        ? current?.sample
          ? [current.sample]
          : []
        : (current?.history ?? []);
  return (
    <section className="zip-bdfb-live-average" aria-label={`Telemetry ${label}`}>
      <header>
        <strong>{window === 'LIVE' ? 'LIVE TELEMETRY' : 'HISTORY'}</strong>
        <span>{label} · Own readings</span>
      </header>
      <div className="zip-bdfb-window-tabs" role="tablist" aria-label="Telemetry time window">
        {['LIVE', ...TELEMETRY_HISTORY_WINDOWS].map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={window === value}
            onClick={() => {
              if (window !== value) {
                setWindow(value);
                setLoading(true);
              }
            }}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>
      <p role="status">
        {loading
          ? 'Loading…'
          : (error ??
            (window === 'LIVE' ? current?.status : `${samples.length} historical packets`))}
      </p>
      {!loading && !error && !samples.length && (
        <p>
          {window === 'LIVE'
            ? 'No own measurements received.'
            : 'No stored measurements in this period.'}
        </p>
      )}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {samples.map((sample) => (
          <article
            key={`${sample.bindingId}:${sample.receivedAt}`}
            style={{ overflowWrap: 'anywhere' }}
          >
            <small>
              {sample.sourceIdentity} · <time>{sample.sourceObservedAt ?? sample.receivedAt}</time>
            </small>
            <div className="zip-bdfb-live-average-grid">
              {telemetryMetrics(sample.reported).map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>
                    {metric.value} {metric.unit}
                  </strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
      <small>Last packet: {current?.sample?.receivedAt ?? '—'}</small>
      {window !== 'LIVE' && (
        <p>Last packet per time bucket; source labels and units preserved. Up to 1000 packets.</p>
      )}
    </section>
  );
}
