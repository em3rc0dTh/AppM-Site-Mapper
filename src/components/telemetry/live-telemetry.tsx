'use client';

import { useEffect, useState } from 'react';

import {
  MetricTile,
  SectionHeader,
  StatePanel,
  StatusBadge,
  Surface,
} from '@/shared/ui/primitives';
import { InspectButton } from '@/shared/ui/entity-inspector';
import { telemetryMetrics } from './telemetry-presentation';
import {
  dedupeTelemetrySamples,
  upsertTelemetrySample,
} from '@/components/telemetry/telemetry-client-state';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export function LiveTelemetry() {
  const [samples, setSamples] = useState<readonly TelemetrySample[]>([]);
  const [state, setState] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      setSamples(dedupeTelemetrySamples(JSON.parse(event.data) as TelemetrySample[]));
      setState('live');
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const sample = JSON.parse(event.data) as TelemetrySample;
      setSamples((current) => upsertTelemetrySample(current, sample));
      setState('live');
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);
    stream.onerror = () => setState('reconnecting');

    return () => stream.close();
  }, []);

  return (
    <main>
      <SectionHeader
        eyebrow="Realtime / measurements"
        title="Telemetry"
        description="Latest reported measurements from mapped Device and Equipment identities."
        actions={
          <span aria-live="polite">
            <StatusBadge tone={state === 'live' ? 'good' : 'warning'}>
              {state === 'live' ? 'STREAM CONNECTED' : state.toUpperCase()}
            </StatusBadge>
          </span>
        }
      />
      {state === 'reconnecting' && (
        <StatePanel
          kind="reconnecting"
          title="Reconnecting to the stream"
          description="Displayed measurements are the last received values. Automatic reconnection is in progress."
        />
      )}
      {samples.length === 0 ? (
        <StatePanel
          kind={state === 'connecting' ? 'loading' : 'empty'}
          title={state === 'connecting' ? 'Connecting to telemetry' : 'No measurements yet'}
          description="Mapped identities will appear after a measurement is received."
        />
      ) : (
        <div className="telemetry-grid">
          {samples.map((sample) => {
            const metrics = telemetryMetrics(sample.reported);
            return (
              <Surface key={sample.entityId} className="telemetry-card">
                <header className="telemetry-card-header">
                  <div>
                    <p className="eyebrow">{sample.entityKind}</p>
                    <h2>{sample.sourceIdentity}</h2>
                    <time dateTime={sample.receivedAt}>
                      Last packet · {sample.receivedAt.replace('T', ' ').replace('Z', ' UTC')}
                    </time>
                  </div>
                  <InspectButton
                    entity={{
                      name: sample.sourceIdentity,
                      kind: sample.entityKind,
                      sections: [
                        {
                          title: 'Overview',
                          fields: [
                            { label: 'Source identity', value: sample.sourceIdentity },
                            { label: 'Entity ID', value: sample.entityId },
                            { label: 'Last received', value: sample.receivedAt },
                          ],
                        },
                      ],
                    }}
                  />
                </header>
                {metrics.length ? (
                  <div className="metric-grid">
                    {metrics.map((metric) => (
                      <MetricTile
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        {...(metric.unit ? { unit: metric.unit } : {})}
                      />
                    ))}
                  </div>
                ) : (
                  <StatePanel
                    title="No scalar measurements"
                    description="This packet contains structured data. Expand the raw payload to inspect it."
                  />
                )}
                <p className="telemetry-unit-note">
                  Source labels and units preserved. Up to 24 scalar fields shown; full packet
                  below.
                </p>
                <details className="raw-payload">
                  <summary>Raw payload</summary>
                  <pre>{JSON.stringify(sample.reported, null, 2)}</pre>
                </details>
              </Surface>
            );
          })}
        </div>
      )}
    </main>
  );
}
