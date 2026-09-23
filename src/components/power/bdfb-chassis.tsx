'use client';

import { useState } from 'react';

import type {
  BreakerHolder,
  DeviceNode,
  Frame,
  Panel,
  Shelf,
} from '@/modules/topology/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

function endpointInspector(
  device: DeviceNode,
  shelf: Shelf,
  frame: Frame,
  panel: Panel,
  endpoint: BreakerHolder,
): InspectorEntity {
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

function PanelBoard({
  device,
  shelf,
  frame,
  panel,
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
  panel: Panel;
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
          panel.endpoints.map((endpoint, index) => (
            <button
              type="button"
              key={endpoint.id}
              className={`bdfb-endpoint bdfb-endpoint--${endpoint.variant.toLowerCase()}`}
              onClick={() => onInspect(endpointInspector(device, shelf, frame, panel, endpoint))}
              title={endpoint.label}
            >
              <span>{(index + 1).toString().padStart(2, '0')}</span>
              <strong>{endpoint.label}</strong>
              <small>{endpoint.variant}</small>
            </button>
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
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
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
  onInspect,
}: Readonly<{
  device: DeviceNode;
  shelf: Shelf;
  frame: Frame;
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
            onInspect={onInspect}
          />
        ))}
      </div>
    </section>
  );
}

export function BdfbChassis({ device }: Readonly<{ device: DeviceNode }>) {
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const shelves = device.bdfb?.shelves ?? [];
  const frames = shelves.flatMap((shelf) => shelf.frames);
  const panels = frames.flatMap((frame) => frame.panels);
  const endpoints = panels.flatMap((panel) => panel.endpoints);
  const implicitFrames = frames.filter(
    (frame) => frame.presentation?.physicalFrameVisible === false,
  ).length;

  return (
    <section className="bdfb-chassis">
      <header className="bdfb-chassis-header">
        <div>
          <span>Power distribution chassis</span>
          <strong>{device.name}</strong>
          <small>Canonical Shelf → Frame → Panel → Breaker / Holder hierarchy</small>
        </div>
        <div className="bdfb-chassis-status">
          <StatusBadge tone="accent">{shelves.length} SHELF</StatusBadge>
          <StatusBadge>{panels.length} PANELS</StatusBadge>
          <StatusBadge>{endpoints.length} ENDPOINTS</StatusBadge>
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
                    onInspect={setSelected}
                  />
                ) : (
                  <ExplicitFrame
                    key={frame.id}
                    device={device}
                    shelf={shelf}
                    frame={frame}
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
