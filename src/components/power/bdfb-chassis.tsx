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

type StreamState = 'connecting' | 'live' | 'reconnecting';

function endpointInspector(
  device: DeviceNode,
  shelf: Shelf,
  frame: Frame,
  panel: Panel,
  endpoint: BreakerHolder,
  telemetry: EndpointTelemetryView | null,
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
        fields: telemetryFields,
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

function EndpointButton({
  device,
  shelf,
  frame,
  panel,
  endpoint,
  sample,
  index,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
  endpoint: BreakerHolder;
  sample: TelemetrySample | null;
  index: number;
  onInspect: (entity: InspectorEntity) => void;
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
      onClick={() => onInspect(endpointInspector(device, shelf, frame, panel, endpoint, telemetry))}
      title={endpoint.label}
    >
      <span className="bdfb-endpoint-index">{(index + 1).toString().padStart(2, '0')}</span>
      <span className="bdfb-endpoint-copy">
        <strong>{endpoint.label}</strong>
        <small>{endpoint.telemetryAddress ?? endpoint.variant}</small>
      </span>
      <span className="bdfb-endpoint-state">
        {telemetry?.state ?? (endpoint.telemetryAddress ? 'WAITING' : endpoint.variant)}
      </span>
      {telemetry?.displayMetrics.length ? (
        <span className="bdfb-endpoint-metrics">
          {telemetry.displayMetrics.map((metric) => (
            <span key={metric.key}>
              <b>{metric.key}</b>
              {metric.value}
            </span>
          ))}
        </span>
      ) : (
        <span className="bdfb-endpoint-metrics bdfb-endpoint-metrics--empty">
          {telemetry ? 'STATE ONLY' : 'NO DATA'}
        </span>
      )}
    </button>
  );
}

function PanelBoard({
  device,
  shelf,
  frame,
  panel,
  sample,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
  sample: TelemetrySample | null;
  onInspect: (entity: InspectorEntity) => void;
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
        onClick={() => onInspect(panelInspector(device, shelf, frame, panel))}
      >
        <span>Panel</span>
        <strong>{panel.label}</strong>
        <small>
          {reporting}/{panel.endpoints.length} reporting
        </small>
      </button>
      <div className="bdfb-panel-busbar bdfb-panel-busbar--a" aria-hidden="true">
        <span>BUS A</span>
      </div>
      <div className="bdfb-panel-busbar bdfb-panel-busbar--b" aria-hidden="true">
        <span>BUS B</span>
      </div>
      <div className="bdfb-endpoint-columns">
        {panel.endpoints.length ? (
          endpointColumns.map((column, columnIndex) => (
            <div className="bdfb-endpoint-column" key={`column-${columnIndex + 1}`}>
              {column.map((endpoint, rowIndex) => (
                <EndpointButton
                  key={endpoint.id}
                  device={device}
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
  device,
  shelf,
  frame,
  sample,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  sample: TelemetrySample | null;
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
            sample={sample}
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
  sample,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  sample: TelemetrySample | null;
  onInspect: (entity: InspectorEntity) => void;
}>) {
  return (
    <section
      className="bdfb-frame-implicit"
      aria-label={`${frame.label} implicit physical frame · panels rendered directly in shelf`}
    >
      <div className="bdfb-implicit-note">
        <span>Implicit frame</span>
        <strong>{frame.label}</strong>
        <small>Canonical hierarchy retained; physical presentation flattened.</small>
      </div>
      <div className="bdfb-panel-grid">
        {frame.panels.map((panel) => (
          <PanelBoard
            key={panel.id}
            device={device}
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
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const [sample, setSample] = useState<TelemetrySample | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const shelves = device.bdfb?.shelves ?? [];
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const endpoints = panels.flatMap((panel) => panel.endpoints);
  const implicitFrames = frames.filter(
    (frame) => frame.presentation?.physicalFrameVisible === false,
  ).length;

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
      <header className="bdfb-chassis-header">
        <div>
          <span>Power distribution chassis</span>
          <strong>{device.name}</strong>
          <small>Canonical Shelf → Frame → Panel → Breaker / Holder hierarchy</small>
        </div>
        <div className="bdfb-chassis-status">
          <StatusBadge tone={sample?.simulated ? 'warning' : sample ? 'good' : 'accent'}>
            {liveLabel}
          </StatusBadge>
          <StatusBadge tone="accent">{shelves.length} SHELF</StatusBadge>
          <StatusBadge>{panels.length} PANELS</StatusBadge>
          <StatusBadge>
            {reportingEndpoints}/{endpoints.length} REPORTING
          </StatusBadge>
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
                    sample={sample}
                    onInspect={setSelected}
                  />
                ) : (
                  <ExplicitFrame
                    key={frame.id}
                    device={device}
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

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
