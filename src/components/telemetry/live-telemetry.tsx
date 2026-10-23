'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  MetricTile,
  SectionHeader,
  StatePanel,
  StatusBadge,
  Surface,
} from '@/shared/ui/primitives';
import { InspectButton } from '@/shared/ui/entity-inspector';
import {
  breakerTelemetryMetrics,
  telemetryMetrics,
} from '@/components/telemetry/telemetry-presentation';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

function upsert(samples: readonly TelemetrySample[], sample: TelemetrySample): TelemetrySample[] {
  const next = samples.filter((item) => item.entityId !== sample.entityId);
  next.push(sample);
  return next.sort((left, right) => left.entityId.localeCompare(right.entityId));
}

export function LiveTelemetry() {
  const t = useTranslations('liveTelemetry');
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
    <main>
      <SectionHeader
        eyebrow="MQTT / measurements"
        title={t('title')}
        description={t('description')}
        actions={
          <span aria-live="polite">
            <StatusBadge tone={state === 'live' ? 'good' : 'warning'}>
              {state === 'live' ? 'MQTT STREAM CONNECTED' : state.toUpperCase()}
            </StatusBadge>
          </span>
        }
      />

      {state === 'reconnecting' && (
        <StatePanel
          kind="reconnecting"
          title={t('reconnecting')}
          description={t('reconnectingHelp')}
        />
      )}

      {samples.length === 0 ? (
        <StatePanel
          kind={state === 'connecting' ? 'loading' : 'empty'}
          title={state === 'connecting' ? t('connecting') : t('noMeasurements')}
          description={t('awaiting')}
        />
      ) : (
        <div className="telemetry-grid">
          {samples.map((sample) => {
            const metrics = telemetryMetrics(sample.reported);
            const breakerReadings = sample.breakerReadings ?? [];

            return (
              <Surface key={sample.entityId} className="telemetry-card">
                <header className="telemetry-card-header">
                  <div>
                    <p className="eyebrow">
                      {sample.protocol === 'BFDB' ? 'BFDB / MQTT' : sample.entityKind}
                    </p>
                    <h2>{sample.sourceIdentity}</h2>
                    <time dateTime={sample.receivedAt}>
                      Last packet · {sample.receivedAt.replace('T', ' ').replace('Z', ' UTC')}
                    </time>
                  </div>
                  <InspectButton
                    entity={{
                      name: sample.sourceIdentity,
                      kind: sample.protocol === 'BFDB' ? 'BFDB MQTT SOURCE' : sample.entityKind,
                      sections: [
                        {
                          title: t('overview'),
                          fields: [
                            { label: t('sourceIdentity'), value: sample.sourceIdentity },
                            { label: t('entityId'), value: sample.entityId },
                            { label: t('lastReceived'), value: sample.receivedAt },
                            ...(sample.messageId
                              ? [{ label: t('messageId'), value: sample.messageId }]
                              : []),
                            ...(sample.sourceObservedAt
                              ? [{ label: t('sourceObserved'), value: sample.sourceObservedAt }]
                              : []),
                          ],
                        },
                      ],
                    }}
                  />
                </header>

                {breakerReadings.length ? (
                  <>
                    <div className="metric-grid">
                      <MetricTile
                        label={t('mapped')}
                        value={breakerReadings.length}
                        detail="Resolved from MQTT points"
                      />
                      <MetricTile
                        label={t('unmapped')}
                        value={sample.unmappedPointIds?.length ?? 0}
                        detail="No breaker binding"
                      />
                    </div>
                    <div className="workspace-card-grid">
                      {breakerReadings.map((reading) => (
                        <div className="workspace-summary-card" key={reading.breakerId}>
                          <strong>{reading.breakerLabel}</strong>
                          <span>
                            {reading.panelLabel} · {reading.rawPointId}
                          </span>
                          {reading.state && <span>State · {reading.state.value}</span>}
                          {breakerTelemetryMetrics(reading).map((metric) => (
                            <span key={metric.label}>
                              {metric.label} · {metric.value}
                              {metric.unit ? ` ${metric.unit}` : ''}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                ) : metrics.length ? (
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
                    title={t('noScalar')}
                    description={t('noScalarHelp')}
                  />
                )}

                <details className="raw-payload">
                  <summary>{t('rawPayload')}</summary>
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
