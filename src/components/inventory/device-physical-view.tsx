'use client';

import Link from 'next/link';
import { useState } from 'react';
import type {
  DeviceNode,
  EquipmentNode,
  ContainerRackNode,
  Shelf,
  Frame,
  Panel,
  BreakerHolder,
} from '@/modules/topology/domain/entities';
import type { PowerPath } from '@/modules/power/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { topologyInspector } from '@/shared/ui/entity-adapters';
import { openPhysicalPopup } from '@/shared/ui/physical-popup';

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export interface ElectricalConnection {
  path: PowerPath;
  sourceName: string;
  targetName: string;
  sourceHref: string;
  targetHref: string;
  sourceTrail: readonly string[];
}

export function DevicePhysicalView({
  device,
  rack,
  href,
  connections,
  focus,
  powerReadable,
  popupMode = false,
  viewMode = 'adaptive',
}: Readonly<{
  device: DeviceNode | EquipmentNode;
  rack: ContainerRackNode | null;
  href: string;
  connections: readonly ElectricalConnection[];
  focus: Readonly<{ shelf?: string; panel?: string; endpoint?: string; path?: string }>;
  powerReadable: boolean;
  popupMode?: boolean;
  viewMode?: 'adaptive' | 'device' | 'panel' | 'endpoint';
}>) {
  const [inspection, setInspection] = useState<InspectorEntity | null>(null);
  const [selection, setSelection] = useState<string | null>(focus.endpoint ?? null);
  const shelves = [...(device.kind === 'DEVICE' ? (device.bdfb?.shelves ?? []) : [])].sort(
    (left, right) => naturalOrder.compare(left.label, right.label),
  );
  const orderedFrames = (shelf: Shelf) =>
    [...shelf.frames].sort((left, right) => naturalOrder.compare(left.label, right.label));
  const orderedPanels = (frame: Frame) =>
    [...frame.panels].sort((left, right) => naturalOrder.compare(left.label, right.label));
  const orderedEndpoints = (panel: Panel) =>
    [...panel.endpoints].sort((left, right) => {
      const positionDelta =
        (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
      return positionDelta || naturalOrder.compare(left.label, right.label);
    });
  const boards = shelves.flatMap((shelf) =>
    orderedFrames(shelf).flatMap((frame) =>
      orderedPanels(frame).map((panel) => ({ shelf, frame, panel })),
    ),
  );
  const activeBoard = boards.find(
    (item) => item.panel.id === focus.panel && (!focus.shelf || item.shelf.id === focus.shelf),
  );
  const activeShelf = shelves.find((item) => item.id === focus.shelf);
  const activeEndpoint = activeBoard?.panel.endpoints.find((item) => item.id === focus.endpoint);
  const activePath = connections.find((item) => item.path.id === focus.path);
  const mount = rack?.cas.find(
    (item) => item.occupantId === device.id && item.state === 'EQUIPPED',
  );
  const uRange =
    mount?.mountStartU !== undefined && mount.physicalSizeU !== undefined
      ? `U${mount.mountStartU}–U${mount.mountStartU + mount.physicalSizeU - 1}`
      : 'Placement not specified';
  function link(params: Record<string, string>) {
    return `${href}?${new URLSearchParams(params)}`;
  }
  function openPanelPopup(shelf: Shelf, panel: Panel) {
    openPhysicalPopup(
      `/popup/panel/${device.id}/${panel.id}?shelf=${encodeURIComponent(shelf.id)}`,
      'panel',
      panel.id,
    );
  }
  function openEndpointPopup(shelf: Shelf, panel: Panel, endpoint: BreakerHolder) {
    openPhysicalPopup(
      `/popup/endpoint/${device.id}/${endpoint.id}?shelf=${encodeURIComponent(
        shelf.id,
      )}&panel=${encodeURIComponent(panel.id)}`,
      'endpoint',
      endpoint.id,
    );
  }
  function endpointLinks(endpoint: BreakerHolder) {
    return connections.filter(
      ({ path }) =>
        (path.source.entityId === device.id &&
          path.source.internal?.breakerHolderId === endpoint.id) ||
        (path.target.entityId === device.id &&
          path.target.internal?.breakerHolderId === endpoint.id),
    );
  }
  function inspectEndpoint(shelf: Shelf, frame: Frame, panel: Panel, endpoint: BreakerHolder) {
    setSelection(endpoint.id);
    setInspection({
      name: endpoint.label,
      kind: endpoint.variant,
      sections: [
        {
          title: 'Electrical context',
          fields: [
            { label: 'BDFB', value: device.name },
            { label: 'Shelf', value: shelf.label },
            { label: 'Frame', value: frame.label },
            { label: 'Panel', value: panel.label },
            { label: 'Capacity', value: endpoint.capacity ?? 'Not specified' },
            {
              label: 'Connections',
              value: powerReadable ? endpointLinks(endpoint).length : 'Restricted',
            },
          ],
        },
      ],
      actions: [
        {
          label: 'Open electrical endpoint',
          href: `/popup/endpoint/${device.id}/${endpoint.id}?shelf=${encodeURIComponent(
            shelf.id,
          )}&panel=${encodeURIComponent(panel.id)}`,
        },
      ],
    });
  }
  function board(
    shelf: Shelf,
    frame: Frame,
    panel: Panel,
    expanded: boolean,
    showEndpoints = true,
  ) {
    const endpoints = orderedEndpoints(panel);
    const breakerCount = endpoints.filter((endpoint) => endpoint.variant === 'BREAKER').length;
    const holderCount = endpoints.length - breakerCount;
    const connectedCount = powerReadable
      ? endpoints.filter((endpoint) => endpointLinks(endpoint).length > 0).length
      : null;

    return (
      <article
        className={`studio-panel ${expanded ? 'is-expanded' : ''} ${showEndpoints ? 'studio-panel--detail' : 'studio-panel--overview'}`}
        key={panel.id}
      >
        <header>
          <div>
            <small>DISTRIBUTION PANEL</small>
            <h2>{panel.label}</h2>
          </div>
          {showEndpoints ? <span className="studio-panel-context">{frame.label}</span> : null}
        </header>
        <div className="studio-bus">
          <span>Distribution endpoints</span>
          <span>{endpoints.length} configured positions</span>
        </div>
        {showEndpoints ? (
          <div className="studio-endpoint-matrix">
            {endpoints.map((endpoint, index) => (
              <div className="studio-endpoint-position" key={endpoint.id}>
                <button
                  className={`studio-endpoint ${endpoint.variant.toLowerCase()} ${selection === endpoint.id || activeEndpoint?.id === endpoint.id ? 'is-selected' : ''}`}
                  onClick={() =>
                    viewMode === 'panel'
                      ? openEndpointPopup(shelf, panel, endpoint)
                      : setSelection(endpoint.id)
                  }
                  onDoubleClick={() => openEndpointPopup(shelf, panel, endpoint)}
                  aria-label={
                    viewMode === 'panel' ? `Open ${endpoint.label}` : `Select ${endpoint.label}`
                  }
                >
                  <span className="studio-terminal-number">
                    {String(endpoint.position ?? index + 1).padStart(2, '0')}
                  </span>
                  <span className="studio-switch" aria-hidden="true" />
                  <strong>{endpoint.label}</strong>
                  <small>
                    {endpoint.capacity !== undefined
                      ? `Capacity ${endpoint.capacity}`
                      : endpoint.variant}
                  </small>
                  <span className="studio-assignment">
                    {powerReadable
                      ? endpointLinks(endpoint).length
                        ? 'CONNECTED'
                        : 'UNASSIGNED'
                      : 'CONNECTIONS RESTRICTED'}
                  </span>
                </button>
                {viewMode !== 'panel' && (
                  <>
                    <button
                      type="button"
                      className="studio-open-endpoint"
                      onClick={() => openEndpointPopup(shelf, panel, endpoint)}
                    >
                      Open endpoint popup ↗
                    </button>
                    {selection === endpoint.id && (
                      <button
                        className="studio-inspect-endpoint"
                        onClick={() => inspectEndpoint(shelf, frame, panel, endpoint)}
                      >
                        Inspect details
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="studio-panel-summary">
            <div>
              <small>BREAKERS</small>
              <strong>{breakerCount}</strong>
            </div>
            <div>
              <small>HOLDERS</small>
              <strong>{holderCount}</strong>
            </div>
            <div>
              <small>CONNECTED</small>
              <strong>{connectedCount ?? '—'}</strong>
            </div>
            <button type="button" onClick={() => openPanelPopup(shelf, panel)}>
              Enter panel →
            </button>
          </div>
        )}
        {!endpoints.length && <p>No endpoints configured on this panel.</p>}
      </article>
    );
  }
  function shelfView(shelf: Shelf) {
    return (
      <section className="studio-shelf" key={shelf.id}>
        <header>
          <span>SHELF</span>
          <Link href={link({ shelf: shelf.id })}>{shelf.label} →</Link>
        </header>
        {orderedFrames(shelf).map((frame) => (
          <div
            key={frame.id}
            className={
              frame.presentation?.physicalFrameVisible === false
                ? 'studio-implicit-frame'
                : 'studio-frame'
            }
          >
            {frame.presentation?.physicalFrameVisible !== false && <h3>{frame.label}</h3>}
            <div className="studio-panel-field">
              {orderedPanels(frame).map((panel) => board(shelf, frame, panel, false, false))}
            </div>
          </div>
        ))}
      </section>
    );
  }
  function endpointDetail() {
    if (!activeBoard || !activeEndpoint) return null;
    const panelEndpoints = orderedEndpoints(activeBoard.panel);
    const position =
      activeEndpoint.position ??
      panelEndpoints.findIndex((endpoint) => endpoint.id === activeEndpoint.id) + 1;
    const links = endpointLinks(activeEndpoint);

    return (
      <section className="studio-endpoint-detail">
        <div className={`studio-endpoint-hero ${activeEndpoint.variant.toLowerCase()}`}>
          <small>PHYSICAL ENDPOINT · POSITION {String(position).padStart(2, '0')}</small>
          <div className="studio-endpoint-hero-switch" aria-hidden="true" />
          <strong>{activeEndpoint.label}</strong>
          <span>{activeEndpoint.variant}</span>
        </div>
        <div className="studio-endpoint-metadata">
          <div>
            <small>DEVICE</small>
            <strong>{device.name}</strong>
          </div>
          <div>
            <small>SHELF / FRAME</small>
            <strong>
              {activeBoard.shelf.label} / {activeBoard.frame.label}
            </strong>
          </div>
          <div>
            <small>PANEL</small>
            <strong>{activeBoard.panel.label}</strong>
          </div>
          <div>
            <small>CAPACITY</small>
            <strong>
              {activeEndpoint.capacity !== undefined ? activeEndpoint.capacity : 'Not specified'}
            </strong>
          </div>
          <div>
            <small>POWER LINKS</small>
            <strong>{powerReadable ? links.length : 'Restricted'}</strong>
          </div>
          <button
            type="button"
            onClick={() => openPanelPopup(activeBoard.shelf, activeBoard.panel)}
          >
            Open parent panel →
          </button>
        </div>
        <div className="studio-endpoint-power">
          <small>ELECTRICAL RELATIONSHIPS</small>
          {!powerReadable ? (
            <strong>Restricted by role</strong>
          ) : links.length === 0 ? (
            <strong>No configured power path</strong>
          ) : (
            links.slice(0, 3).map((connection) => (
              <div key={connection.path.id}>
                <span>{connection.sourceName}</span>
                <b>→</b>
                <span>{connection.targetName}</span>
              </div>
            ))
          )}
          {links.length > 3 && <span>+{links.length - 3} additional paths</span>}
        </div>
      </section>
    );
  }

  const endpointConnections = activeEndpoint ? endpointLinks(activeEndpoint) : connections;
  const focusedConnections = activePath
    ? connections.filter((item) => item.path.target.entityId === activePath.path.target.entityId)
    : endpointConnections;
  const invalidFocus =
    (focus.shelf && !activeShelf) ||
    (focus.panel && !activeBoard) ||
    (focus.endpoint && !activeEndpoint) ||
    (focus.path && !activePath);
  return (
    <section className={`studio-device studio-device--${viewMode}`}>
      <nav className="studio-local-nav" aria-label="Equipment physical context">
        <Link href={href} aria-current={!focus.shelf && !focus.path ? 'page' : undefined}>
          Chassis
        </Link>
        {activeShelf && <Link href={link({ shelf: activeShelf.id })}>{activeShelf.label}</Link>}
        {activeBoard && (
          <>
            <span className="studio-frame-context">
              {activeBoard.frame.label}
              {activeBoard.frame.presentation?.physicalFrameVisible === false ? ' · implicit' : ''}
            </span>
            <Link href={link({ shelf: activeBoard.shelf.id, panel: activeBoard.panel.id })}>
              {activeBoard.panel.label}
            </Link>
          </>
        )}
        {activeEndpoint && activeBoard && (
          <Link
            href={link({
              shelf: activeBoard.shelf.id,
              panel: activeBoard.panel.id,
              endpoint: activeEndpoint.id,
            })}
          >
            {activeEndpoint.label}
          </Link>
        )}
        {activePath && <span>Power trace</span>}
        <Link href={popupMode ? `/popup/container/${device.parentId}` : `/rack/${device.parentId}`}>
          ↑ Rack
        </Link>
      </nav>
      <div className="studio-device-scroll">
        {invalidFocus ? (
          <p role="alert">
            This component or power path is unavailable. <Link href={href}>Return to chassis</Link>
          </p>
        ) : (
          <>
            {!activePath &&
              (shelves.length ? (
                viewMode === 'endpoint' && activeEndpoint ? (
                  endpointDetail()
                ) : viewMode === 'panel' && activeBoard ? (
                  board(activeBoard.shelf, activeBoard.frame, activeBoard.panel, true, true)
                ) : viewMode === 'device' ? (
                  (activeShelf ? [activeShelf] : shelves).map(shelfView)
                ) : activeBoard ? (
                  board(activeBoard.shelf, activeBoard.frame, activeBoard.panel, true, true)
                ) : (
                  (activeShelf ? [activeShelf] : shelves).map(shelfView)
                )
              ) : (
                <div className="studio-generic-front">
                  <span className="studio-mount-ear" aria-hidden="true" />
                  <div className="studio-device-face">
                    <small>{device.category ?? device.kind} · GENERIC FRONT VIEW</small>
                    <h2>{device.name}</h2>
                    <div className="studio-vent" aria-hidden="true" />
                    <div className="studio-device-plate">
                      <span>{uRange}</span>
                      <span>{device.lifecycle}</span>
                    </div>
                  </div>
                  <span className="studio-mount-ear" aria-hidden="true" />
                </div>
              ))}
            {viewMode === 'adaptive' && activeEndpoint && (
              <div className="studio-endpoint-context">
                <strong>{activeEndpoint.label}</strong>
                <span>{activeEndpoint.variant}</span>
                <span>Capacity: {activeEndpoint.capacity ?? 'Not specified'}</span>
                <span>
                  {activeBoard?.shelf.label} / {activeBoard?.frame.label} /{' '}
                  {activeBoard?.panel.label}
                </span>
              </div>
            )}
            {viewMode === 'adaptive' && (
              <section className="studio-connections">
                <header>
                  <div>
                    <small>ELECTRICAL TOPOLOGY</small>
                    <h2>{activePath ? 'Power trace' : 'Power relationships'}</h2>
                  </div>
                  <span>Configured connections · no live telemetry</span>
                </header>
                {!powerReadable ? (
                  <p>Your role cannot read power relationships.</p>
                ) : !focusedConnections.length ? (
                  <p>
                    {activeEndpoint
                      ? 'No power path assigned to this endpoint.'
                      : 'No configured power relationships.'}
                  </p>
                ) : (
                  focusedConnections.map((connection) => (
                    <div
                      className={`studio-power-trace ${connection.path.feed === 'B' ? 'feed-b' : ''}`}
                      key={connection.path.id}
                    >
                      <div className="studio-power-source">
                        <small>SOURCE</small>
                        <button
                          onClick={() =>
                            setInspection({
                              name: connection.sourceName,
                              kind: 'POWER SOURCE',
                              sections: [
                                {
                                  title: 'Physical distribution',
                                  fields: connection.sourceTrail.map((name, index) => ({
                                    label:
                                      ['BDFB', 'Shelf', 'Frame', 'Panel', 'Endpoint'][index] ??
                                      'Context',
                                    value: name,
                                  })),
                                },
                              ],
                              actions: [
                                { label: 'Open source endpoint', href: connection.sourceHref },
                              ],
                            })
                          }
                        >
                          {connection.sourceName}
                        </button>
                        <span>{connection.sourceTrail.slice(1).join(' / ')}</span>
                        <button
                          type="button"
                          onClick={() =>
                            openPhysicalPopup(
                              connection.sourceHref,
                              'device',
                              connection.path.source.entityId,
                            )
                          }
                        >
                          Open source popup ↗
                        </button>
                      </div>
                      <div className="studio-feed">
                        <span>
                          {connection.path.feed
                            ? `FEED ${connection.path.feed}`
                            : 'FEED UNSPECIFIED'}
                        </span>
                        <svg viewBox="0 0 200 30" aria-hidden="true">
                          <path d="M0 15H192M181 5L193 15L181 25" />
                        </svg>
                        <button
                          type="button"
                          onClick={() =>
                            openPhysicalPopup(
                              link({
                                ...(focus.shelf ? { shelf: focus.shelf } : {}),
                                ...(focus.panel ? { panel: focus.panel } : {}),
                                ...(focus.endpoint ? { endpoint: focus.endpoint } : {}),
                                path: connection.path.id,
                              }),
                              'power',
                              connection.path.id,
                            )
                          }
                        >
                          Trace connection ↗
                        </button>
                      </div>
                      <div className="studio-power-target">
                        <small>DESTINATION</small>
                        <button
                          type="button"
                          onClick={() =>
                            openPhysicalPopup(
                              connection.targetHref,
                              'device',
                              connection.path.target.entityId,
                            )
                          }
                        >
                          {connection.targetName} ↗
                        </button>
                        <span>{connection.path.label ?? 'Configured power path'}</span>
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
            {(viewMode === 'adaptive' || viewMode === 'device') && (
              <div className="studio-device-facts">
                <span>
                  {rack?.name ?? 'Rack unavailable'} · {uRange}
                </span>
                <span>Serial: {device.serialNumber ?? 'Not specified'}</span>
                <button onClick={() => setInspection(topologyInspector(device, href))}>
                  Inspect identity
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {inspection && <EntityInspector entity={inspection} onClose={() => setInspection(null)} />}
    </section>
  );
}
