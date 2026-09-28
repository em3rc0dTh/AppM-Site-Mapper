'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  BreakerHolder,
  DeviceNode,
  Frame,
  Panel,
  Shelf,
} from '@/modules/topology/domain/entities';
import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

function formatMetric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function telemetryFields(reading: BreakerTelemetryReading) {
  return [
    { label: 'MQTT source', value: reading.sourceIdentity },
    { label: 'Raw point', value: reading.rawPointId },
    { label: 'State', value: reading.state?.value ?? 'Not reported' },
    {
      label: 'Voltage',
      value: formatMetric(reading.metrics.voltageV?.value, 'V'),
    },
    {
      label: 'Current',
      value: formatMetric(reading.metrics.currentA?.value, 'A'),
    },
    {
      label: 'Power',
      value: formatMetric(reading.metrics.powerW?.value, 'W'),
    },
    {
      label: 'Energy',
      value: formatMetric(reading.metrics.energyKwh?.value, 'kWh', 4),
    },
    { label: 'Last MQTT packet', value: reading.receivedAt },
  ];
}

function endpointInspector(
  device: DeviceNode,
  shelf: Shelf,
  frame: Frame,
  panel: Panel,
  endpoint: BreakerHolder,
  reading?: BreakerTelemetryReading,
): InspectorEntity {
  return {
    name: endpoint.label,
    kind: endpoint.variant,
    ...(reading?.state ? { status: reading.state.value } : {}),
    sections: [
      {
        title: 'Electrical endpoint',
        fields: [
          { label: 'BDFB', value: device.name },
          { label: 'Shelf', value: shelf.label },
          {
            label: 'Frame',
            value:
              frame.presentation?.physicalFrameVisible === false
                ? `${frame.label} · implicit`
                : frame.label,
          },
          { label: 'Panel', value: panel.label },
          { label: 'Capacity', value: endpoint.capacity ?? 'Not specified' },
          { label: 'Endpoint ID', value: endpoint.id },
          {
            label: 'MQTT binding',
            value: endpoint.telemetry?.rawPointId ?? 'Panel order + position',
          },
        ],
      },
      ...(reading
        ? [
            {
              title: 'MQTT telemetry',
              fields: telemetryFields(reading),
            },
          ]
        : []),
    ],
  };
}

function panelInspector(
  device: DeviceNode,
  shelf: Shelf,
  frame: Frame,
  panel: Panel,
): InspectorEntity {
  return {
    name: panel.label,
    kind: 'PANEL',
    sections: [
      {
        title: 'Physical hierarchy',
        fields: [
          { label: 'BDFB', value: device.name },
          { label: 'Shelf', value: shelf.label },
          {
            label: 'Frame',
            value:
              frame.presentation?.physicalFrameVisible === false
                ? `${frame.label} · implicit`
                : frame.label,
          },
          { label: 'Endpoints', value: panel.endpoints.length },
        ],
      },
    ],
  };
}

function endpointPreview(
  endpoint: BreakerHolder,
  reading: BreakerTelemetryReading | undefined,
): string {
  if (!reading) return endpoint.variant;

  const voltage = reading.metrics.voltageV?.value;
  const current = reading.metrics.currentA?.value;

  if (voltage !== undefined || current !== undefined) {
    return [
      voltage === undefined ? null : `${voltage.toFixed(1)} V`,
      current === undefined ? null : `${current.toFixed(1)} A`,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return reading.state?.value ?? endpoint.variant;
}

function PanelBoard({
  device,
  shelf,
  frame,
  panel,
  readingsByBreaker,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  onInspect: (entity: InspectorEntity) => void;
}>) {
  return (
    <article className="bdfb-panel-board">
      <button
        type="button"
        className="bdfb-panel-title"
        onClick={() => onInspect(panelInspector(device, shelf, frame, panel))}
      >
        <span>Panel</span>
        <strong>{panel.label}</strong>
        <small>{panel.endpoints.length} endpoints</small>
      </button>
      <div className="bdfb-panel-busbar bdfb-panel-busbar--a" aria-hidden="true">
        <span>BUS A</span>
      </div>
      <div className="bdfb-panel-busbar bdfb-panel-busbar--b" aria-hidden="true">
        <span>BUS B</span>
      </div>
      <div className="bdfb-endpoint-grid">
        {panel.endpoints.length ? (
          panel.endpoints.map((endpoint, index) => {
            const reading = readingsByBreaker[endpoint.id];

            return (
              <button
                type="button"
                key={endpoint.id}
                className={`bdfb-endpoint bdfb-endpoint--${endpoint.variant.toLowerCase()}`}
                onClick={() =>
                  onInspect(endpointInspector(device, shelf, frame, panel, endpoint, reading))
                }
                title={endpoint.label}
              >
                <span>{(index + 1).toString().padStart(2, '0')}</span>
                <strong>{endpoint.label}</strong>
                <small>{endpointPreview(endpoint, reading)}</small>
              </button>
            );
          })
        ) : (
          <div className="bdfb-empty-endpoints">No endpoints configured</div>
        )}
      </div>
    </article>
  );
}

function ExplicitFrame({
  device,
  shelf,
  frame,
  readingsByBreaker,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  onInspect: (entity: InspectorEntity) => void;
}>) {
  return (
    <section className="bdfb-frame">
      <header>
        <span>Physical frame</span>
        <strong>{frame.label}</strong>
      </header>
      <div className="bdfb-panel-grid">
        {frame.panels.map((panel) => (
          <PanelBoard
            key={panel.id}
            device={device}
            shelf={shelf}
            frame={frame}
            panel={panel}
            readingsByBreaker={readingsByBreaker}
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  );
}

function ImplicitFrame({
  device,
  shelf,
  frame,
  readingsByBreaker,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  onInspect: (entity: InspectorEntity) => void;
}>) {
  return (
    <section
      className="bdfb-frame-hidden"
      aria-label={`${frame.label} hidden physical frame · panels rendered directly in shelf`}
    >
      <div className="bdfb-panel-grid bdfb-panel-grid--frame-hidden">
        {frame.panels.map((panel) => (
          <PanelBoard
            key={panel.id}
            device={device}
            shelf={shelf}
            frame={frame}
            panel={panel}
            readingsByBreaker={readingsByBreaker}
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  );
}

function useBdfbTelemetry(deviceId: string): TelemetrySample | null {
  const [sample, setSample] = useState<TelemetrySample | null>(null);

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      const samples = JSON.parse(event.data) as TelemetrySample[];
      setSample(samples.find((candidate) => candidate.entityId === deviceId) ?? null);
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const incoming = JSON.parse(event.data) as TelemetrySample;
      if (incoming.entityId === deviceId) {
        setSample(incoming);
      }
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);

    return () => stream.close();
  }, [deviceId]);

  return sample;
}

export function BdfbChassis({ device }: Readonly<{ device: DeviceNode }>) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const telemetry = useBdfbTelemetry(device.id);
  const shelves = device.bdfb?.shelves ?? [];
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const endpoints = panels.flatMap((panel) => panel.endpoints);
  const implicitFrames = frames.filter(
    (frame) => frame.presentation?.physicalFrameVisible === false,
  ).length;

  const readingsByBreaker = useMemo(
    () =>
      Object.fromEntries(
        (telemetry?.breakerReadings ?? []).map((reading) => [reading.breakerId, reading]),
      ) as Readonly<Record<string, BreakerTelemetryReading>>,
    [telemetry],
  );

  return (
    <section className="bdfb-chassis">
      <header className="bdfb-chassis-header">
        <div>
          <span>Power distribution chassis</span>
          <strong>{device.name}</strong>
          <small>MQTT measurements mapped onto the existing breaker hierarchy</small>
        </div>
        <div className="bdfb-chassis-status">
          <StatusBadge tone="accent">{shelves.length} SHELF</StatusBadge>
          <StatusBadge>{panels.length} PANELS</StatusBadge>
          <StatusBadge>{endpoints.length} ENDPOINTS</StatusBadge>
          {telemetry?.breakerReadings?.length ? (
            <StatusBadge tone="good">{telemetry.breakerReadings.length} MQTT BREAKERS</StatusBadge>
          ) : (
            <StatusBadge tone="warning">MQTT WAITING</StatusBadge>
          )}
          {implicitFrames > 0 && (
            <StatusBadge tone="warning">{implicitFrames} IMPLICIT FRAME</StatusBadge>
          )}
        </div>
      </header>

      <div className="bdfb-chassis-body">
        {shelves.map((shelf) => (
          <section className="bdfb-shelf" key={shelf.id}>
            <header>
              <span>Shelf</span>
              <strong>{shelf.label}</strong>
            </header>
            <div className="bdfb-shelf-hardware" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="bdfb-frame-field">
              {shelf.frames.map((frame) =>
                frame.presentation?.physicalFrameVisible === false ? (
                  <ImplicitFrame
                    key={frame.id}
                    device={device}
                    shelf={shelf}
                    frame={frame}
                    readingsByBreaker={readingsByBreaker}
                    onInspect={setSelected}
                  />
                ) : (
                  <ExplicitFrame
                    key={frame.id}
                    device={device}
                    shelf={shelf}
                    frame={frame}
                    readingsByBreaker={readingsByBreaker}
                    onInspect={setSelected}
                  />
                ),
              )}
            </div>
          </section>
        ))}
      </div>

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
