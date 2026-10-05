'use client';

import { useEffect, useMemo, useState } from 'react';

import type {
  BdfbBreakerView,
  BdfbFrameView,
  BdfbPanelView,
  BdfbPresentation,
  BdfbShelfView,
} from '@/modules/power/domain/bdfb-model';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

interface PanelSelection {
  readonly shelf: BdfbShelfView;
  readonly frame: BdfbFrameView;
  readonly panel: BdfbPanelView;
}

function formatMetric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function telemetryFields(reading: BreakerTelemetryReading) {
  return [
    { label: 'MQTT source', value: reading.sourceIdentity },
    { label: 'Raw point', value: reading.rawPointId },
    { label: 'State', value: reading.state?.value ?? 'Not reported' },
    { label: 'Voltage', value: formatMetric(reading.metrics.voltageV?.value, 'V') },
    { label: 'Current', value: formatMetric(reading.metrics.currentA?.value, 'A') },
    { label: 'Power', value: formatMetric(reading.metrics.powerW?.value, 'W') },
    { label: 'Energy', value: formatMetric(reading.metrics.energyKwh?.value, 'kWh', 4) },
    { label: 'Last MQTT packet', value: reading.receivedAt },
  ];
}

function breakerInspector(
  device: DeviceNode,
  shelf: BdfbShelfView,
  frame: BdfbFrameView,
  panel: BdfbPanelView,
  breaker: BdfbBreakerView,
  reading?: BreakerTelemetryReading,
): InspectorEntity {
  return {
    name: breaker.label,
    kind: 'CIRCUIT BREAKER',
    ...(reading?.state ? { status: reading.state.value } : {}),
    sections: [
      {
        title: 'Electrical endpoint',
        fields: [
          { label: 'BDFB', value: device.name },
          { label: 'Shelf', value: shelf.label },
          { label: 'Frame', value: frame.label },
          { label: 'Panel', value: panel.label },
          { label: 'Capacity', value: breaker.capacity ?? 'Not specified' },
          { label: 'Equipment ID', value: breaker.id },
          { label: 'AccessPort', value: breaker.accessPortId },
          { label: 'MQTT binding', value: breaker.rawPointId ?? 'Explicit TelemetryBinding' },
        ],
      },
      ...(reading ? [{ title: 'MQTT telemetry', fields: telemetryFields(reading) }] : []),
    ],
  };
}

function panelInspector(
  device: DeviceNode,
  shelf: BdfbShelfView,
  frame: BdfbFrameView,
  panel: BdfbPanelView,
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
          { label: 'Frame', value: frame.label },
          { label: 'Positions', value: panel.positions.length },
          { label: 'Breakers', value: panel.positions.filter(Boolean).length },
        ],
      },
    ],
  };
}

function breakerPreview(
  breaker: BdfbBreakerView,
  reading: BreakerTelemetryReading | undefined,
): string {
  if (!reading) return 'BREAKER';

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

  return reading.state?.value ?? 'BREAKER';
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
  shelf: BdfbShelfView;
  frame: BdfbFrameView;
  panel: BdfbPanelView;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  onInspect: (entity: InspectorEntity) => void;
}>) {
  return (
    <article className="bdfb-panel-board bdfb-panel-board--detail">
      <button
        type="button"
        className="bdfb-panel-title"
        onClick={() => onInspect(panelInspector(device, shelf, frame, panel))}
      >
        <span>Panel</span>
        <strong>{panel.label}</strong>
        <small>{panel.positions.filter(Boolean).length} breakers</small>
      </button>

      <div className="bdfb-panel-busbar bdfb-panel-busbar--a" aria-hidden="true">
        <span>BUS A</span>
      </div>
      <div className="bdfb-panel-busbar bdfb-panel-busbar--b" aria-hidden="true">
        <span>BUS B</span>
      </div>

      <div className="bdfb-endpoint-grid">
        {panel.positions.length ? (
          panel.positions.map((breaker, index) =>
            breaker ? (
              <button
                type="button"
                key={breaker.id}
                className="bdfb-endpoint bdfb-endpoint--breaker"
                onClick={() =>
                  onInspect(
                    breakerInspector(
                      device,
                      shelf,
                      frame,
                      panel,
                      breaker,
                      readingsByBreaker[breaker.id],
                    ),
                  )
                }
                title={breaker.label}
              >
                <span>{(index + 1).toString().padStart(2, '0')}</span>
                <strong>{breaker.label}</strong>
                <small>{breakerPreview(breaker, readingsByBreaker[breaker.id])}</small>
              </button>
            ) : (
              <div
                key={`empty-${index}`}
                className="bdfb-endpoint bdfb-endpoint--holder"
                aria-label={`Empty position ${index + 1}`}
              >
                <span>{(index + 1).toString().padStart(2, '0')}</span>
                <strong>EMPTY</strong>
                <small>AVAILABLE</small>
              </div>
            ),
          )
        ) : (
          <div className="bdfb-empty-endpoints">No positions configured</div>
        )}
      </div>
    </article>
  );
}

function DeviceHierarchyOverview({
  device,
  shelves,
  onOpenPanel,
}: Readonly<{
  device: DeviceNode;
  shelves: readonly BdfbShelfView[];
  onOpenPanel: (selection: PanelSelection) => void;
}>) {
  return (
    <div className="bdfb-device-overview">
      <section className="bdfb-overview-device">
        <header className="bdfb-overview-label bdfb-overview-label--device">
          <span>DEVICE</span>
          <strong>{device.name}</strong>
        </header>

        {shelves.map((shelf) => (
          <section className="bdfb-overview-shelf" key={shelf.id}>
            <header className="bdfb-overview-label bdfb-overview-label--shelf">
              <span>SHELF</span>
              <strong>{shelf.label}</strong>
            </header>

            <div className="bdfb-overview-frame-grid">
              {shelf.frames.map((frame) => (
                <section className="bdfb-overview-frame" key={frame.id}>
                  <header className="bdfb-overview-label bdfb-overview-label--frame">
                    <span>{frame.physical ? 'FRAME' : 'DIRECT'}</span>
                    <strong>{frame.label.replace(/^Frame\s+/i, '')}</strong>
                  </header>

                  <div className="bdfb-overview-panels">
                    {frame.panels.map((panel) => (
                      <button
                        type="button"
                        className="bdfb-overview-panel"
                        key={panel.id}
                        onClick={() => onOpenPanel({ shelf, frame, panel })}
                        aria-label={`Open ${panel.label} breaker detail`}
                      >
                        <strong>{panel.label}</strong>
                        <span>{panel.positions.filter(Boolean).length} BREAKERS</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}

function PanelDetail({
  device,
  selection,
  readingsByBreaker,
  onInspect,
  onBack,
}: Readonly<{
  device: DeviceNode;
  selection: PanelSelection;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  onInspect: (entity: InspectorEntity) => void;
  onBack: () => void;
}>) {
  return (
    <section className="bdfb-panel-detail">
      <header className="bdfb-panel-detail-header">
        <button type="button" onClick={onBack}>
          ← DEVICE
        </button>
        <div>
          <span>
            {selection.shelf.label} / {selection.frame.label}
          </span>
          <strong>{selection.panel.label}</strong>
          <small>Breaker detail · live MQTT overlay</small>
        </div>
      </header>

      <div className="bdfb-panel-detail-body">
        <PanelBoard
          device={device}
          shelf={selection.shelf}
          frame={selection.frame}
          panel={selection.panel}
          readingsByBreaker={readingsByBreaker}
          onInspect={onInspect}
        />
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
      if (incoming.entityId === deviceId) setSample(incoming);
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);
    return () => stream.close();
  }, [deviceId]);

  return sample;
}

export function BdfbChassis({
  device,
  presentation,
}: Readonly<{ device: DeviceNode; presentation: BdfbPresentation }>) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const [activePanel, setActivePanel] = useState<PanelSelection | null>(null);
  const telemetry = useBdfbTelemetry(device.id);
  const shelves = presentation.shelves;
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const breakers = panels.flatMap((panel) => panel.positions).filter(Boolean);

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
          <span>Physical distribution</span>
          <strong>{activePanel ? activePanel.panel.label : 'Panel layout'}</strong>
          <small>
            {activePanel
              ? 'Circuit-breaker detail with live MQTT measurements when available'
              : 'Canonical Device → Equipment hierarchy · enter a panel for breaker detail'}
          </small>
        </div>

        <div className="bdfb-chassis-status">
          <StatusBadge tone="accent">{shelves.length} SHELF</StatusBadge>
          <StatusBadge>{frames.length} FRAMES</StatusBadge>
          <StatusBadge>{panels.length} PANELS</StatusBadge>
          <StatusBadge>{breakers.length} BREAKERS</StatusBadge>
          {telemetry?.breakerReadings?.length ? (
            <StatusBadge tone="good">{telemetry.breakerReadings.length} MQTT BREAKERS</StatusBadge>
          ) : (
            <StatusBadge tone="warning">MQTT WAITING</StatusBadge>
          )}
        </div>
      </header>

      <div className="bdfb-chassis-body">
        {activePanel ? (
          <PanelDetail
            device={device}
            selection={activePanel}
            readingsByBreaker={readingsByBreaker}
            onInspect={setSelected}
            onBack={() => setActivePanel(null)}
          />
        ) : (
          <DeviceHierarchyOverview device={device} shelves={shelves} onOpenPanel={setActivePanel} />
        )}
      </div>

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
