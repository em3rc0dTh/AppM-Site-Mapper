'use client';

import { useEffect, useState } from 'react';

import { getBdfbPresentation } from '@/modules/power/application/bdfb-presentation';
import { aggregateBdfbTelemetry } from '@/modules/telemetry/application/bdfb-telemetry-aggregate';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

function metric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function compactUtc(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${parsed.toISOString().slice(11, 19)} UTC`;
}

function useTelemetrySample(deviceId: string): TelemetrySample | null {
  const [sample, setSample] = useState<TelemetrySample | null>(null);

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      const samples = JSON.parse(event.data) as TelemetrySample[];
      setSample(samples.find((candidate) => candidate.entityId === deviceId) ?? null);
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const incoming = JSON.parse(event.data) as TelemetrySample;
      if (incoming.entityId === deviceId) setSample(incoming);
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);

    return () => stream.close();
  }, [deviceId]);

  return sample;
}

export function BdfbTelemetryInspector({
  node,
  activePanelId,
  location,
  feeds,
}: Readonly<{
  node: DeviceNode;
  activePanelId?: string;
  location?: string;
  feeds?: readonly string[];
}>) {
  const telemetry = useTelemetrySample(node.id);
  const presentation = getBdfbPresentation(node);
  const frames = presentation.shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const selectedPanel = activePanelId
    ? panels.find((panel) => panel.id === activePanelId) ?? null
    : null;
  const scopeEndpoints = selectedPanel
    ? selectedPanel.endpoints
    : panels.flatMap((panel) => panel.endpoints);

  const aggregate = aggregateBdfbTelemetry(scopeEndpoints, telemetry?.breakerReadings ?? []);

  const hasA = feeds?.includes('A') ?? false;
  const hasB = feeds?.includes('B') ?? false;
  const scopeLabel = selectedPanel?.label ?? 'Entire BDFB';
  const endpoints = panels.flatMap((panel) => panel.endpoints);

  return (
    <aside className="telxius-properties zip-bdfb-inspector">
      <header>
        INSPECTOR <span>⌄</span>
      </header>

      <div className="zip-bdfb-inspector-id">
        <span>▥</span>
        <div>
          <h2>{node.name}</h2>
          <small>{location ?? 'Infrastructure'}</small>
        </div>
      </div>

      <section className="zip-bdfb-live-average" aria-label="BDFB live telemetry average">
        <header>
          <div>
            <i aria-hidden="true" data-live={aggregate.activeBreakers > 0 ? 'true' : 'false'} />
            <strong>LIVE AVERAGE</strong>
          </div>
          <span>{scopeLabel}</span>
        </header>

        <div className="zip-bdfb-live-average-grid">
          <div>
            <span>AVG VOLTAGE</span>
            <strong>{metric(aggregate.averageVoltageV, 'V')}</strong>
          </div>
          <div>
            <span>AVG CURRENT</span>
            <strong>{metric(aggregate.averageCurrentA, 'A')}</strong>
          </div>
          <div>
            <span>AVG POWER</span>
            <strong>{metric(aggregate.averagePowerW, 'W')}</strong>
          </div>
          <div>
            <span>AVG ENERGY</span>
            <strong>{metric(aggregate.averageEnergyKwh, 'kWh', 4)}</strong>
          </div>
        </div>

        <dl className="zip-bdfb-live-average-counts">
          <dt>Active breakers</dt>
          <dd>{aggregate.activeBreakers}</dd>
          <dt>Breakers without live reading</dt>
          <dd>{aggregate.withoutLiveReading}</dd>
          <dt>Empty holders</dt>
          <dd>{aggregate.emptyHolders}</dd>
          <dt>Last packet</dt>
          <dd>{compactUtc(aggregate.latestReceivedAt)}</dd>
        </dl>
      </section>

      <dl>
        <dt>Type</dt>
        <dd>BDFB</dd>
        <dt>Location</dt>
        <dd>{location ?? '—'}</dd>
        <dt>Shelves</dt>
        <dd>{presentation.physicalShelfCount}</dd>
        <dt>Frames</dt>
        <dd>{presentation.physicalFrameCount}</dd>
        <dt>Panel slots</dt>
        <dd>{presentation.physicalPanelSlotCount}</dd>
        <dt>Breakers</dt>
        <dd>{endpoints.filter((endpoint) => endpoint.variant === 'BREAKER').length}</dd>
        <dt>Feed A</dt>
        <dd>{hasA ? 'Configured' : '—'}</dd>
        <dt>Feed B</dt>
        <dd>{hasB ? 'Configured' : '—'}</dd>
        <dt>Telemetry</dt>
        <dd>
          {endpoints.some((endpoint) => endpoint.telemetry?.rawPointId)
            ? 'EXPLICIT BINDINGS'
            : 'UNMAPPED'}
        </dd>
      </dl>

      <section className="zip-bdfb-status-card">
        <h3>STATUS</h3>
        <div>
          <span>●</span>
          <strong>
            {aggregate.activeBreakers > 0 ? 'Live breaker telemetry received' : 'Physical inventory recorded'}
          </strong>
          <small>
            {aggregate.activeBreakers > 0
              ? `${aggregate.activeBreakers} breaker readings contribute to the current average.`
              : 'Live health requires an explicitly mapped MQTT reading.'}
          </small>
        </div>
      </section>

      <div className="zip-bdfb-actions">
        <span>
          {endpoints.filter((endpoint) => Boolean(endpoint.telemetry?.rawPointId)).length}{' '}
          explicit MQTT bindings
        </span>
        <span>
          {selectedPanel
            ? `Average scope: ${selectedPanel.label}`
            : 'Average scope: all configured BDFB breakers'}
        </span>
      </div>
    </aside>
  );
}
