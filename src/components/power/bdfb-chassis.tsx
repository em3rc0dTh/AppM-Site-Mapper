'use client';

import { ContextPin } from '@/components/workspace/context-pin';
import { useSearchParams } from 'next/navigation';
import { TelemetryLens } from '@/components/telemetry/telemetry-lens';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { getBdfbPresentation } from '@/modules/power/application/bdfb-presentation';
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

interface PanelSelection {
  readonly shelf: Shelf;
  readonly frame: Frame;
  readonly panel: Panel;
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
  bindings: readonly BreakerPowerBinding[] = [],
  canWritePower = false,
): InspectorEntity {
  const connectHref =
    endpoint.variant === 'BREAKER' && canWritePower
      ? `/power/connect?entity=${encodeURIComponent(device.id)}&shelf=${encodeURIComponent(shelf.id)}&frame=${encodeURIComponent(frame.id)}&panel=${encodeURIComponent(panel.id)}&breaker=${encodeURIComponent(endpoint.id)}`
      : null;
  const feeds = [...new Set(bindings.map((binding) => binding.feed).filter(Boolean))].join(' + ');
  const destinations = bindings
    .map((binding) =>
      binding.accessPortLabel
        ? `${binding.counterpartName} / ${binding.accessPortLabel}`
        : binding.counterpartName,
    )
    .join(' · ');
  const contexts = [...new Set(bindings.map((binding) => binding.counterpartContext))].join(' · ');
  const mounts = [...new Set(bindings.map((binding) => binding.mount).filter(Boolean))].join(' · ');

  const actions = [
    ...bindings.map((binding) => ({
      label: `TRACE ${binding.counterpartName}`,
      href: `/power?path=${encodeURIComponent(binding.pathId)}&breaker=${encodeURIComponent(endpoint.id)}${binding.feed ? `&feed=${binding.feed}` : ''}`,
    })),
    ...(connectHref
      ? [{ label: bindings.length ? 'CONNECT ANOTHER LOAD' : 'CONNECT POWER', href: connectHref }]
      : []),
  ];

  return {
    name: endpoint.label,
    kind: endpoint.variant,
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
              {
                label: 'Energy',
                value: formatMetric(reading.metrics.energyKwh?.value, 'kWh', 4),
              },
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
          { label: 'Capacity', value: endpoint.capacity ?? 'Not specified' },
          { label: 'Feed', value: feeds || 'Not configured' },
          { label: 'Connected loads', value: bindings.length },
          { label: 'Destination', value: destinations || 'Not provisioned' },
          { label: 'Destination context', value: contexts || 'Not available' },
          { label: 'Rack / U', value: mounts || 'Not available' },
          { label: 'Endpoint ID', value: endpoint.id },
          {
            label: 'MQTT binding',
            value:
              endpoint.telemetry?.rawPointId ??
              (endpoint.variant === 'HOLDER'
                ? 'NOT APPLICABLE · empty holder'
                : 'UNMAPPED · configure an explicit binding'),
          },
          {
            label: 'Telemetry',
            value: reading
              ? 'Measurements available for this exact endpoint'
              : endpoint.telemetry?.rawPointId
                ? 'Bound, awaiting matched MQTT measurements'
                : endpoint.variant === 'HOLDER'
                  ? 'Empty holder. Breaker measurements are not expected without an installed and mapped breaker.'
                  : "No point mapping. Broker connectivity does not provide this breaker's data.",
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
          { label: 'Frame', value: frame.label },
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
  bindingsByBreaker,
  canWritePower,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  bindingsByBreaker: Readonly<Record<string, readonly BreakerPowerBinding[]>>;
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
        <small>{panel.endpoints.length} endpoints</small>
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
            '--bdfb-panel-rows': Math.max(1, Math.ceil(panel.endpoints.length / 2)),
          } as CSSProperties
        }
      >
        {panel.endpoints.length ? (
          panel.endpoints.map((endpoint, index) => {
            const reading = readingsByBreaker[endpoint.id];

            return (
              <button
                type="button"
                key={endpoint.id}
                className={`bdfb-endpoint bdfb-endpoint--${endpoint.variant.toLowerCase()}`}
                data-telemetry={
                  reading ? 'live' : endpoint.telemetry?.rawPointId ? 'mapped' : 'unmapped'
                }
                onClick={() =>
                  onInspect(
                    endpointInspector(
                      device,
                      shelf,
                      frame,
                      panel,
                      endpoint,
                      reading,
                      bindingsByBreaker[endpoint.id] ?? [],
                      canWritePower,
                    ),
                    endpoint.id,
                  )
                }
                title={endpoint.label}
              >
                <span>{(index + 1).toString().padStart(2, '0')}</span>
                <strong>{endpoint.label}</strong>
                <small>{endpointPreview(endpoint, reading)}</small>
                {reading && (
                  <i
                    className="bdfb-live-indicator"
                    aria-hidden="true"
                    title={`LIVE · ${compactUtcTimestamp(reading.receivedAt)}`}
                  />
                )}
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

function DeviceHierarchyOverview({
  device,
  shelves,
  onOpenPanel,
}: Readonly<{
  device: DeviceNode;
  shelves: readonly Shelf[];
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
                    <span>
                      {frame.presentation?.physicalFrameVisible === false ? 'PANEL GROUP' : 'FRAME'}
                    </span>
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
                    {frame.panels.map((panel) => {
                      const empty = panel.endpoints.length === 0;
                      return (
                        <button
                          type="button"
                          className="bdfb-overview-panel"
                          data-empty={empty ? 'true' : 'false'}
                          key={panel.id}
                          onClick={() => onOpenPanel({ shelf, frame, panel })}
                          aria-label={`Open ${panel.label} breaker detail`}
                        >
                          <strong>{panel.label}</strong>
                          <span>
                            {empty ? 'EMPTY SLOT' : `${panel.endpoints.length} ENDPOINTS`}
                          </span>
                        </button>
                      );
                    })}
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
  bindingsByBreaker,
  canWritePower,
  onInspect,
  onBack,
}: Readonly<{
  device: DeviceNode;
  selection: PanelSelection;
  readingsByBreaker: Readonly<Record<string, BreakerTelemetryReading>>;
  bindingsByBreaker: Readonly<Record<string, readonly BreakerPowerBinding[]>>;
  canWritePower: boolean;
  onInspect: (entity: InspectorEntity, breakerId?: string) => void;
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
          <small>Breaker and holder detail · live MQTT overlay</small>
        </div>
      </header>

      <div className="bdfb-panel-detail-body">
        <PanelBoard
          device={device}
          shelf={selection.shelf}
          frame={selection.frame}
          panel={selection.panel}
          readingsByBreaker={readingsByBreaker}
          bindingsByBreaker={bindingsByBreaker}
          canWritePower={canWritePower}
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

export function BdfbChassis({
  device,
  powerBindings = [],
  canWritePower = false,
}: Readonly<{
  device: DeviceNode;
  powerBindings?: readonly BreakerPowerBinding[];
  canWritePower?: boolean;
}>) {
  const query = useSearchParams();
  const bindingsByBreaker = useMemo(() => {
    const grouped: Record<string, BreakerPowerBinding[]> = {};
    for (const binding of powerBindings) {
      (grouped[binding.breakerId] ??= []).push(binding);
    }
    return grouped as Readonly<Record<string, readonly BreakerPowerBinding[]>>;
  }, [powerBindings]);
  const initialPanel = (() => {
    const requestedPanel = query.get('panel');
    if (!requestedPanel) return null;

    for (const shelf of device.bdfb?.shelves ?? []) {
      for (const frame of shelf.frames) {
        for (const panel of frame.panels) {
          if (panel.id === requestedPanel) return { shelf, frame, panel };
        }
      }
    }

    return null;
  })();
  const initialSelected = (() => {
    const requestedBreaker = query.get('breaker');
    if (!initialPanel || !requestedBreaker) return null;

    const endpoint = initialPanel.panel.endpoints.find((item) => item.id === requestedBreaker);
    if (!endpoint) return null;

    return endpointInspector(
      device,
      initialPanel.shelf,
      initialPanel.frame,
      initialPanel.panel,
      endpoint,
      undefined,
      bindingsByBreaker[endpoint.id] ?? [],
      canWritePower,
    );
  })();

  const [selected, setSelected] = useState<InspectorEntity | null>(initialSelected);
  const [selectedBreakerId, setSelectedBreakerId] = useState<string | null>(query.get('breaker'));
  const [activePanel, setActivePanel] = useState<PanelSelection | null>(initialPanel);
  const telemetry = useBdfbTelemetry(device.id);
  const presentation = getBdfbPresentation(device);
  const shelves = presentation.shelves;
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const endpoints = panels.flatMap((panel) => panel.endpoints);

  const readingsByBreaker = useMemo(
    () =>
      Object.fromEntries(
        (telemetry?.breakerReadings ?? []).map((reading) => [reading.breakerId, reading]),
      ) as Readonly<Record<string, BreakerTelemetryReading>>,
    [telemetry],
  );
  // Store the selected identity, not a stale copy of its measurements.
  const liveInspector = useMemo(() => {
    if (!selectedBreakerId) return selected;
    for (const shelf of device.bdfb?.shelves ?? []) {
      for (const frame of shelf.frames) {
        for (const panel of frame.panels) {
          const endpoint = panel.endpoints.find((item) => item.id === selectedBreakerId);
          if (endpoint) {
            return endpointInspector(
              device,
              shelf,
              frame,
              panel,
              endpoint,
              readingsByBreaker[endpoint.id],
              bindingsByBreaker[endpoint.id] ?? [],
              canWritePower,
            );
          }
        }
      }
    }
    return selected;
  }, [selected, selectedBreakerId, readingsByBreaker, bindingsByBreaker, device, canWritePower]);

  return (
    <section className="bdfb-chassis">
      <TelemetryLens
        label={device.name}
        entityIds={[device.id]}
        breakerId={selectedBreakerId ?? query.get('breaker') ?? undefined}
      />
      <header className="bdfb-chassis-header">
        <div>
          <span>Physical distribution</span>
          <strong>{activePanel ? activePanel.panel.label : 'Panel layout'}</strong>
          <small>
            {activePanel
              ? 'Breaker and holder detail with live MQTT measurements when available'
              : 'Canonical device hierarchy · enter a panel for breaker detail'}
          </small>
        </div>

        <div className="bdfb-chassis-status">
          <ContextPin entityId={device.id} />
          <StatusBadge tone="accent">{shelves.length} SHELF</StatusBadge>
          <StatusBadge>{frames.length} FRAMES</StatusBadge>
          <StatusBadge>{panels.length} PANELS</StatusBadge>
          <StatusBadge>{endpoints.length} ENDPOINTS</StatusBadge>
          {telemetry?.breakerReadings?.length ? (
            <StatusBadge tone="good">
              {telemetry.breakerReadings.length} MAPPED MQTT READINGS
            </StatusBadge>
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
            bindingsByBreaker={bindingsByBreaker}
            canWritePower={canWritePower}
            onInspect={(entity, breakerId) => {
              setSelected(entity);
              setSelectedBreakerId(breakerId ?? null);
            }}
            onBack={() => setActivePanel(null)}
          />
        ) : (
          <DeviceHierarchyOverview device={device} shelves={shelves} onOpenPanel={setActivePanel} />
        )}
      </div>

      {selected && (
        <EntityInspector
          entity={liveInspector}
          onClose={() => {
            setSelected(null);
            setSelectedBreakerId(null);
          }}
        />
      )}
    </section>
  );
}
