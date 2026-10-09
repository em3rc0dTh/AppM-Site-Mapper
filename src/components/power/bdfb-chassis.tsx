'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { ContextPin } from '@/components/workspace/context-pin';
import type {
  BdfbBreakerView,
  BdfbFrameView,
  BdfbPanelView,
  BdfbPresentation,
  BdfbShelfView,
} from '@/modules/power/domain/bdfb-model';
import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

interface PanelSelection {
  readonly shelf: BdfbShelfView;
  readonly frame: BdfbFrameView;
  readonly panel: BdfbPanelView;
}

export interface BreakerPowerBinding {
  readonly breakerId: string;
  readonly pathId: string;
  readonly feed?: 'A' | 'B';
  readonly counterpartName: string;
  readonly counterpartHref: string;
  readonly counterpartContext: string;
  readonly accessPortLabel?: string;
  readonly mount?: string;
}
export interface BreakerTelemetryBindingSummary {
  readonly breakerId: string;
  readonly sourceIdentity: string;
  readonly sourcePointId: string;
  readonly metric: string;
}

function formatMetric(value: number | undefined, unit: string, decimals = 2): string {
  return value === undefined ? '—' : `${value.toFixed(decimals)} ${unit}`;
}

function compactUtcTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : `${parsed.toISOString().slice(11, 19)} UTC`;
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
  reading: BreakerTelemetryReading | undefined,
  bindings: readonly BreakerPowerBinding[],
  telemetryBindings: readonly BreakerTelemetryBindingSummary[],
  canWritePower: boolean,
): InspectorEntity {
  const feeds = [...new Set(bindings.map((binding) => binding.feed).filter(Boolean))].join(' + ');
  const destinations = bindings
    .map((binding) =>
      binding.accessPortLabel
        ? `${binding.counterpartName} / ${binding.accessPortLabel}`
        : binding.counterpartName,
    )
    .join(' · ');
  const actions = [
    ...bindings.map((binding) => ({
      label: `TRACE ${binding.counterpartName}`,
      href: `/power?path=${encodeURIComponent(binding.pathId)}&breaker=${encodeURIComponent(breaker.id)}${binding.feed ? `&feed=${binding.feed}` : ''}`,
    })),
    ...(canWritePower
      ? [
          {
            label: bindings.length ? 'CONNECT ANOTHER LOAD' : 'CONNECT POWER',
            href: `/power/connect?entity=${encodeURIComponent(device.id)}&shelf=${encodeURIComponent(shelf.id)}&frame=${encodeURIComponent(frame.id)}&panel=${encodeURIComponent(panel.id)}&breaker=${encodeURIComponent(breaker.id)}`,
          },
        ]
      : []),
  ];

  return {
    name: breaker.label,
    kind: 'CIRCUIT BREAKER',
    actions,
    ...(reading?.state ? { status: reading.state.value } : {}),
    ...(reading
      ? {
          liveSummary: {
            label: 'LIVE MQTT',
            source: reading.sourceIdentity,
            point: reading.rawPointId,
            updatedAt: reading.receivedAt,
            metrics: [
              { label: 'Voltage', value: formatMetric(reading.metrics.voltageV?.value, 'V') },
              { label: 'Current', value: formatMetric(reading.metrics.currentA?.value, 'A') },
              { label: 'Power', value: formatMetric(reading.metrics.powerW?.value, 'W') },
              { label: 'Energy', value: formatMetric(reading.metrics.energyKwh?.value, 'kWh', 4) },
            ],
          },
        }
      : {}),
    sections: [
      {
        title: 'Electrical endpoint',
        fields: [
          { label: 'BDFB', value: device.name },
          { label: 'Shelf', value: shelf.label },
          { label: 'Frame', value: frame.label },
          { label: 'Panel', value: panel.label },
          { label: 'Capacity', value: breaker.capacity ?? 'Not specified' },
          { label: 'Feed', value: feeds || 'Not configured' },
          { label: 'Connected loads', value: bindings.length },
          { label: 'Destination', value: destinations || 'Not provisioned' },
          { label: 'Equipment ID', value: breaker.id },
          { label: 'AccessPort', value: breaker.accessPortId },
          {
            label: 'MQTT binding',
            value:
              telemetryBindings.length > 0
                ? [
                    ...new Set(
                      telemetryBindings.map(
                        (binding) => binding.sourceIdentity + ' / ' + binding.sourcePointId,
                      ),
                    ),
                  ].join(' · ')
                : 'Not mapped',
          },
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
  bindingsByBreaker,
  telemetryBindingsByBreaker,
  canWritePower,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: BdfbShelfView;
  frame: BdfbFrameView;
  panel: BdfbPanelView;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  bindingsByBreaker: Readonly<Record<string, readonly BreakerPowerBinding[]>>;
  telemetryBindingsByBreaker: Readonly<Record<string, readonly BreakerTelemetryBindingSummary[]>>;
  canWritePower: boolean;
  onInspect: (entity: InspectorEntity, breakerId?: string) => void;
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
        <span>PANEL BUS</span>
      </div>
      <div className="bdfb-panel-busbar bdfb-panel-busbar--b" aria-hidden="true">
        <span>ENDPOINTS</span>
      </div>

      <div
        className="bdfb-endpoint-grid"
        style={
          {
            '--bdfb-panel-rows': Math.max(1, Math.ceil(panel.positions.length / 2)),
          } as CSSProperties
        }
      >
        {panel.positions.map((breaker, index) =>
          breaker ? (
            <button
              type="button"
              key={breaker.id}
              className="bdfb-endpoint bdfb-endpoint--breaker"
              data-telemetry={
                readingsByBreaker[breaker.id]
                  ? 'live'
                  : telemetryBindingsByBreaker[breaker.id]?.length
                    ? 'mapped'
                    : 'unmapped'
              }
              onClick={() =>
                onInspect(
                  breakerInspector(
                    device,
                    shelf,
                    frame,
                    panel,
                    breaker,
                    readingsByBreaker[breaker.id],
                    bindingsByBreaker[breaker.id] ?? [],
                    telemetryBindingsByBreaker[breaker.id] ?? [],
                    canWritePower,
                  ),
                  breaker.id,
                )
              }
              title={breaker.label}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{breaker.label}</strong>
              <small>{breakerPreview(breaker, readingsByBreaker[breaker.id])}</small>
              {readingsByBreaker[breaker.id] ? (
                <i
                  className="bdfb-live-indicator"
                  aria-hidden="true"
                  title={`LIVE · ${compactUtcTimestamp(readingsByBreaker[breaker.id]!.receivedAt)}`}
                />
              ) : null}
            </button>
          ) : (
            <div
              key={`empty-${index}`}
              className="bdfb-endpoint bdfb-endpoint--holder"
              aria-label={`Empty position ${index + 1}`}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>EMPTY</strong>
              <small>AVAILABLE</small>
            </div>
          ),
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
              <span>{shelf.physical === false ? 'CHASSIS MOUNT' : 'SHELF'}</span>
              <strong>{shelf.label}</strong>
            </header>
            <div className="bdfb-overview-frame-grid">
              {shelf.frames.map((frame) => (
                <section className="bdfb-overview-frame" key={frame.id}>
                  <header className="bdfb-overview-label bdfb-overview-label--frame">
                    <span>{frame.physical ? 'FRAME' : 'PANEL GROUP'}</span>
                    <strong>{frame.label.replace(/^Frame\s+/i, '')}</strong>
                  </header>
                  <div
                    className="bdfb-overview-panels"
                    style={
                      {
                        '--bdfb-overview-panel-count': Math.max(1, frame.panels.length),
                      } as CSSProperties
                    }
                  >
                    {frame.panels.map((panel) => (
                      <button
                        type="button"
                        className="bdfb-overview-panel"
                        data-empty={
                          panel.positions.every((item) => item === null) ? 'true' : 'false'
                        }
                        key={panel.id}
                        onClick={() => onOpenPanel({ shelf, frame, panel })}
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
  powerBindings = [],
  telemetryBindings = [],
  canWritePower = false,
}: Readonly<{
  device: DeviceNode;
  presentation: BdfbPresentation;
  powerBindings?: readonly BreakerPowerBinding[];
  telemetryBindings?: readonly BreakerTelemetryBindingSummary[];
  canWritePower?: boolean;
}>) {
  const query = useSearchParams();
  const bindingsByBreaker = useMemo(() => {
    const grouped: Record<string, BreakerPowerBinding[]> = {};
    for (const binding of powerBindings) (grouped[binding.breakerId] ??= []).push(binding);
    return grouped as Readonly<Record<string, readonly BreakerPowerBinding[]>>;
  }, [powerBindings]);
  const telemetryBindingsByBreaker = useMemo(() => {
    const grouped: Record<string, BreakerTelemetryBindingSummary[]> = {};
    for (const binding of telemetryBindings) {
      (grouped[binding.breakerId] ??= []).push(binding);
    }
    return grouped as Readonly<Record<string, readonly BreakerTelemetryBindingSummary[]>>;
  }, [telemetryBindings]);

  const initialPanel = (() => {
    const requested = query.get('panel');
    if (!requested) return null;
    for (const shelf of presentation.shelves) {
      for (const frame of shelf.frames) {
        const panel = frame.panels.find((candidate) => candidate.id === requested);
        if (panel) return { shelf, frame, panel };
      }
    }
    return null;
  })();

  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const [selectedBreakerId, setSelectedBreakerId] = useState<string | null>(query.get('breaker'));
  const [activePanel, setActivePanel] = useState<PanelSelection | null>(initialPanel);
  const telemetry = useBdfbTelemetry(device.id);
  const readingsByBreaker = useMemo(
    () =>
      Object.fromEntries(
        (telemetry?.breakerReadings ?? []).map((reading) => [reading.breakerId, reading]),
      ) as Readonly<Record<string, BreakerTelemetryReading>>,
    [telemetry],
  );

  const liveInspector = useMemo(() => {
    if (!selectedBreakerId) return selected;
    for (const shelf of presentation.shelves) {
      for (const frame of shelf.frames) {
        for (const panel of frame.panels) {
          const breaker = panel.positions.find((item) => item?.id === selectedBreakerId);
          if (breaker) {
            return breakerInspector(
              device,
              shelf,
              frame,
              panel,
              breaker,
              readingsByBreaker[breaker.id],
              bindingsByBreaker[breaker.id] ?? [],
              telemetryBindingsByBreaker[breaker.id] ?? [],
              canWritePower,
            );
          }
        }
      }
    }
    return selected;
  }, [
    presentation,
    selected,
    selectedBreakerId,
    device,
    readingsByBreaker,
    bindingsByBreaker,
    telemetryBindingsByBreaker,
    canWritePower,
  ]);

  const shelves = presentation.shelves;
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const breakers = panels.flatMap((panel) => panel.positions).filter(Boolean);
  const physicalShelves = shelves.filter((shelf) => shelf.physical !== false).length;
  const physicalFrames = frames.filter((frame) => frame.physical).length;
  const panelGroups = frames.filter((frame) => !frame.physical).length;

  return (
    <section className="bdfb-chassis">
      <TelemetryLens
        label={device.name}
        entityIds={[device.id]}
        breakerId={selectedBreakerId ?? undefined}
      />
      <header className="bdfb-chassis-header">
        <div>
          <span>Physical distribution</span>
          <strong>{activePanel ? activePanel.panel.label : 'Panel layout'}</strong>
          <small>
            {activePanel
              ? 'Breaker detail with live MQTT measurements when available'
              : 'Canonical Device → Equipment hierarchy · enter a panel for breaker detail'}
          </small>
        </div>
        <div className="bdfb-chassis-status">
          <ContextPin entityId={device.id} />
          <Link
            className="bdfb-open-chassis"
            href={'/device/' + encodeURIComponent(presentation.chassisId)}
          >
            OPEN CHASSIS
          </Link>
          <StatusBadge tone="accent">
            {physicalShelves > 0 ? `${physicalShelves} SHELVES` : 'DIRECT CHASSIS'}
          </StatusBadge>
          {physicalFrames > 0 ? <StatusBadge>{physicalFrames} FRAMES</StatusBadge> : null}
          {panelGroups > 0 ? <StatusBadge>{panelGroups} PANEL GROUPS</StatusBadge> : null}
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
          <section className="bdfb-panel-detail">
            <header className="bdfb-panel-detail-header">
              <button type="button" onClick={() => setActivePanel(null)}>
                ← DEVICE
              </button>
              <div>
                <span>
                  {activePanel.shelf.label} / {activePanel.frame.label}
                </span>
                <strong>{activePanel.panel.label}</strong>
                <small>Breaker detail · live MQTT overlay</small>
              </div>
            </header>
            <div className="bdfb-panel-detail-body">
              <PanelBoard
                device={device}
                shelf={activePanel.shelf}
                frame={activePanel.frame}
                panel={activePanel.panel}
                readingsByBreaker={readingsByBreaker}
                bindingsByBreaker={bindingsByBreaker}
                telemetryBindingsByBreaker={telemetryBindingsByBreaker}
                canWritePower={canWritePower}
                onInspect={(entity, breakerId) => {
                  setSelected(entity);
                  setSelectedBreakerId(breakerId ?? null);
                }}
              />
            </div>
          </section>
        ) : (
          <DeviceHierarchyOverview device={device} shelves={shelves} onOpenPanel={setActivePanel} />
        )}
      </div>

      {liveInspector ? (
        <EntityInspector
          entity={liveInspector}
          onClose={() => {
            setSelected(null);
            setSelectedBreakerId(null);
          }}
        />
      ) : null}
    </section>
  );
}
