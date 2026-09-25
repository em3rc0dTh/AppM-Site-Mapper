'use client';

import { useEffect, useState } from 'react';

import { BreakerHistoryPanel } from '@/components/power/breaker-history-panel';
import { endpointTelemetry, type EndpointTelemetryView } from '@/components/power/bdfb-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type {
  BreakerHolder,
  DeviceNode,
  Frame,
  Panel,
  Shelf,
} from '@/modules/topology/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

type StreamState = 'connecting' | 'live' | 'reconnecting' | 'session ended';

interface PhysicalSelection {
  readonly shelf: Shelf;
  readonly frame: Frame;
  readonly panel: Panel;
  readonly endpoint?: BreakerHolder;
}

function endpointInspector(
  device: DeviceNode,
  shelf: Shelf,
  frame: Frame,
  panel: Panel,
  endpoint: BreakerHolder,
  telemetry: EndpointTelemetryView | null,
  streamState: StreamState,
): InspectorEntity {
  const telemetryFields = telemetry
    ? [
        { label: 'Telemetry address', value: telemetry.address },
        ...(telemetry.state === undefined ? [] : [{ label: 'State', value: telemetry.state }]),
        ...Object.entries(telemetry.rawFields)
          .filter(([key]) => key !== 'state')
          .map(([key, value]) => ({ label: key, value })),
        ...(telemetry.receivedAt === undefined
          ? []
          : [{ label: 'Last received', value: telemetry.receivedAt }]),
        { label: 'Source class', value: telemetry.simulated ? 'SIMULATED' : 'HARDWARE' },
      ]
    : [
        {
          label: 'Telemetry address',
          value: endpoint.telemetryAddress ?? 'Not bound',
        },
        { label: 'Telemetry', value: 'No current reading' },
      ];

  return {
    name: endpoint.label,
    kind: endpoint.variant,
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
        ],
      },
      {
        title: 'Realtime telemetry',
        fields: [{ label: 'Stream', value: streamState.toUpperCase() }, ...telemetryFields],
      },
      {
        title: 'History',
        content: endpoint.telemetryAddress ? (
          <BreakerHistoryPanel entityId={device.id} componentAddress={endpoint.telemetryAddress} />
        ) : (
          <p>No telemetry address is bound to this endpoint.</p>
        ),
      },
    ],
  };
}

function panelInspector(
  device: DeviceNode,
  shelf: Shelf,
  frame: Frame,
  panel: Panel,
  sample: TelemetrySample | null,
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
          {
            label: 'Reporting',
            value: panel.endpoints.filter((endpoint) =>
              endpointTelemetry(sample, endpoint.telemetryAddress),
            ).length,
          },
          {
            label: 'Breakers',
            value: panel.endpoints.filter((endpoint) => endpoint.variant === 'BREAKER').length,
          },
          {
            label: 'Free holders',
            value: panel.endpoints.filter((endpoint) => endpoint.variant === 'HOLDER').length,
          },
          { label: 'Panel ID', value: panel.id },
        ],
      },
    ],
  };
}

function EndpointButton({
  shelf,
  frame,
  panel,
  endpoint,
  sample,
  index,
  onInspect,
}: Readonly<{
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
  endpoint: BreakerHolder;
  sample: TelemetrySample | null;
  index: number;
  onInspect: (selection: PhysicalSelection) => void;
}>) {
  const telemetry = endpointTelemetry(sample, endpoint.telemetryAddress);
  const online = telemetry?.state?.toUpperCase() === 'ONLINE';
  const telemetryClass = telemetry
    ? online
      ? 'bdfb-endpoint--telemetry-online'
      : 'bdfb-endpoint--telemetry-present'
    : 'bdfb-endpoint--telemetry-missing';

  return (
    <button
      type="button"
      className={`bdfb-endpoint bdfb-endpoint--${endpoint.variant.toLowerCase()} ${telemetryClass}`}
      onClick={() => onInspect({ shelf, frame, panel, endpoint })}
      aria-label={`Open ${endpoint.label} · ${endpoint.variant}`}
      title={`${endpoint.label} · ${endpoint.telemetryAddress ?? endpoint.variant}`}
    >
      <span className="bdfb-endpoint-index">{(index + 1).toString().padStart(2, '0')}</span>
      {endpoint.variant === 'HOLDER' ? (
        <span className="bdfb-endpoint-summary bdfb-endpoint-summary--holder">HOLDER</span>
      ) : telemetry?.displayMetrics.length ? (
        <span className="bdfb-endpoint-summary bdfb-endpoint-summary--metrics">
          {telemetry.displayMetrics.map((metric) => (
            <span className="bdfb-endpoint-reading" key={metric.key}>
              <b>{metric.key}</b>
              <span>{metric.value}</span>
            </span>
          ))}
        </span>
      ) : telemetry ? (
        <span className="bdfb-endpoint-summary bdfb-endpoint-summary--state">
          <strong>{telemetry.state ?? 'STATE'}</strong>
          <small>STATE ONLY</small>
        </span>
      ) : (
        <span className="bdfb-endpoint-summary bdfb-endpoint-summary--empty">NO DATA</span>
      )}
    </button>
  );
}

function PanelBoard({
  shelf,
  frame,
  panel,
  sample,
  onInspect,
}: Readonly<{
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
  sample: TelemetrySample | null;
  onInspect: (selection: PhysicalSelection) => void;
}>) {
  const reporting = panel.endpoints.filter(
    (endpoint) => endpointTelemetry(sample, endpoint.telemetryAddress) !== null,
  ).length;
  const columnSize = Math.ceil(panel.endpoints.length / 2);
  const endpointColumns = [
    panel.endpoints.slice(0, columnSize),
    panel.endpoints.slice(columnSize),
  ] as const;

  return (
    <article className="bdfb-panel-board">
      <button
        type="button"
        className="bdfb-panel-title"
        onClick={() => onInspect({ shelf, frame, panel })}
      >
        <span>Panel</span>
        <strong>{panel.label}</strong>
        <small>
          {reporting}/{panel.endpoints.length} reporting
        </small>
      </button>
      <div className="bdfb-endpoint-columns">
        {panel.endpoints.length ? (
          endpointColumns.map((column, columnIndex) => (
            <div className="bdfb-endpoint-column" key={`column-${columnIndex + 1}`}>
              {column.map((endpoint, rowIndex) => (
                <EndpointButton
                  key={endpoint.id}
                  shelf={shelf}
                  frame={frame}
                  panel={panel}
                  endpoint={endpoint}
                  sample={sample}
                  index={columnIndex * columnSize + rowIndex}
                  onInspect={onInspect}
                />
              ))}
            </div>
          ))
        ) : (
          <div className="bdfb-empty-endpoints">No endpoints configured</div>
        )}
      </div>
    </article>
  );
}

function ExplicitFrame({
  shelf,
  frame,
  sample,
  onInspect,
}: Readonly<{
  shelf: Shelf;
  frame: Frame;
  sample: TelemetrySample | null;
  onInspect: (selection: PhysicalSelection) => void;
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
            shelf={shelf}
            frame={frame}
            panel={panel}
            sample={sample}
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  );
}

function ImplicitFrame({
  shelf,
  frame,
  sample,
  onInspect,
}: Readonly<{
  shelf: Shelf;
  frame: Frame;
  sample: TelemetrySample | null;
  onInspect: (selection: PhysicalSelection) => void;
}>) {
  return (
    <section
      className="bdfb-frame-implicit"
      aria-label={`${frame.label} implicit physical frame · panels rendered directly in shelf`}
    >
      <div className="bdfb-panel-grid">
        {frame.panels.map((panel) => (
          <PanelBoard
            key={panel.id}
            shelf={shelf}
            frame={frame}
            panel={panel}
            sample={sample}
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  );
}

export function BdfbChassis({ device }: Readonly<{ device: DeviceNode }>) {
  const [selected, setSelected] = useState<PhysicalSelection | null>(null);
  const [sample, setSample] = useState<TelemetrySample | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const shelves = device.bdfb?.shelves ?? [];
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const endpoints = panels.flatMap((panel) => panel.endpoints);

  useEffect(() => {
    const stream = new EventSource('/api/telemetry/stream');

    const onSnapshot = (event: MessageEvent<string>) => {
      const samples = JSON.parse(event.data) as TelemetrySample[];
      setSample(samples.find((candidate) => candidate.entityId === device.id) ?? null);
      setStreamState('live');
    };

    const onTelemetry = (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as TelemetrySample;
      if (next.entityId !== device.id) return;

      setSample(next);
      setStreamState('live');
    };

    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('telemetry', onTelemetry as EventListener);
    stream.onerror = () => setStreamState('reconnecting');
    stream.addEventListener('session', () => {
      stream.close();
      setStreamState('session ended');
    });

    return () => stream.close();
  }, [device.id]);

  const reportingEndpoints = endpoints.filter(
    (endpoint) => endpointTelemetry(sample, endpoint.telemetryAddress) !== null,
  ).length;

  const liveLabel =
    streamState === 'live'
      ? sample?.simulated
        ? 'SIMULATED · LIVE'
        : sample
          ? 'HARDWARE · LIVE'
          : 'LIVE · WAITING'
      : streamState.toUpperCase();

  return (
    <section className="bdfb-chassis">
      <header className="bdfb-chassis-header" aria-label="Device source and contents">
        <StatusBadge tone={sample?.simulated ? 'warning' : sample ? 'good' : 'accent'}>
          {liveLabel}
        </StatusBadge>
        <span>
          {shelves.length} shelf · {panels.length} panels · {reportingEndpoints}/{endpoints.length}{' '}
          reporting
        </span>
      </header>

      <div className="bdfb-chassis-body">
        {shelves.map((shelf) => (
          <section className="bdfb-shelf" key={shelf.id}>
            <header>
              <span>Shelf</span>
              <strong>{shelf.label}</strong>
            </header>
            <div className="bdfb-frame-field">
              {shelf.frames.map((frame) =>
                frame.presentation?.physicalFrameVisible === false ? (
                  <ImplicitFrame
                    key={frame.id}
                    shelf={shelf}
                    frame={frame}
                    sample={sample}
                    onInspect={setSelected}
                  />
                ) : (
                  <ExplicitFrame
                    key={frame.id}
                    shelf={shelf}
                    frame={frame}
                    sample={sample}
                    onInspect={setSelected}
                  />
                ),
              )}
            </div>
          </section>
        ))}
      </div>

      {selected && (
        <EntityInspector
          entity={
            selected.endpoint
              ? endpointInspector(
                  device,
                  selected.shelf,
                  selected.frame,
                  selected.panel,
                  selected.endpoint,
                  endpointTelemetry(sample, selected.endpoint.telemetryAddress),
                  streamState,
                )
              : panelInspector(device, selected.shelf, selected.frame, selected.panel, sample)
          }
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
