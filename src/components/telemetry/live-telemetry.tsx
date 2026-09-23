'use client';

import { useEffect, useState } from 'react';

import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

function upsert(samples: readonly TelemetrySample[], sample: TelemetrySample): TelemetrySample[] {
  const next = samples.filter((item) => item.entityId !== sample.entityId);
  next.push(sample);
  return next.sort((left, right) => left.entityId.localeCompare(right.entityId));
}

export function LiveTelemetry() {
  const [samples, setSamples] = useState<readonly TelemetrySample[]>([]);
  const [state, setState] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      setSamples(JSON.parse(event.data) as TelemetrySample[]);
      setState('live');
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const sample = JSON.parse(event.data) as TelemetrySample;
      setSamples((current) => upsert(current, sample));
      setState('live');
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);
    stream.onerror = () => setState('reconnecting');

    return () => stream.close();
  }, []);

  return (
    <section>
      <header>
        <p>Realtime gateway</p>
        <h1>Telemetry</h1>
        <strong aria-live="polite">{state.toUpperCase()}</strong>
      </header>

      {samples.length === 0 ? (
        <p>No live measurements have been received for mapped Device or Equipment identities.</p>
      ) : (
        <div>
          {samples.map((sample) => (
            <article key={sample.entityId}>
              <h2>{sample.entityKind}</h2>
              <p>{sample.sourceIdentity}</p>
              <time>{sample.receivedAt}</time>
              <pre>{JSON.stringify(sample.reported, null, 2)}</pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
