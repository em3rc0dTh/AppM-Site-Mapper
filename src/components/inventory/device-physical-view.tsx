'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DeviceNode, EquipmentNode, ContainerRackNode, Shelf, Frame, Panel, BreakerHolder } from '@/modules/topology/domain/entities';
import type { PowerPath } from '@/modules/power/domain/entities';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { topologyInspector } from '@/shared/ui/entity-adapters';

export interface ElectricalConnection {
  path: PowerPath;
  sourceName: string;
  targetName: string;
  sourceHref: string;
  targetHref: string;
  sourceTrail: readonly string[];
}

export function DevicePhysicalView({ device, rack, href, connections, focus, powerReadable }: Readonly<{
  device: DeviceNode | EquipmentNode;
  rack: ContainerRackNode | null;
  href: string;
  connections: readonly ElectricalConnection[];
  focus: Readonly<{ shelf?: string; panel?: string; endpoint?: string; path?: string }>;
  powerReadable: boolean;
}>) {
  const [inspection, setInspection] = useState<InspectorEntity | null>(null);
  const [selection, setSelection] = useState<string | null>(focus.endpoint ?? null);
  const shelves = device.kind === 'DEVICE' ? device.bdfb?.shelves ?? [] : [];
  const boards = shelves.flatMap(shelf => shelf.frames.flatMap(frame => frame.panels.map(panel => ({ shelf, frame, panel }))));
  const activeBoard = boards.find(item => item.panel.id === focus.panel);
  const activeShelf = shelves.find(item => item.id === focus.shelf);
  const activeEndpoint = activeBoard?.panel.endpoints.find(item => item.id === focus.endpoint);
  const activePath = connections.find(item => item.path.id === focus.path);
  const mount = rack?.cas.find(item => item.occupantId === device.id && item.state === 'EQUIPPED');
  const uRange = mount?.mountStartU !== undefined && mount.physicalSizeU !== undefined
    ? `U${mount.mountStartU}–U${mount.mountStartU + mount.physicalSizeU - 1}` : 'Placement not specified';
  function link(params: Record<string, string>) { return `${href}?${new URLSearchParams(params)}`; }
  function endpointLinks(endpoint: BreakerHolder) {
    return connections.filter(({ path }) =>
      (path.source.entityId === device.id && path.source.internal?.breakerHolderId === endpoint.id) ||
      (path.target.entityId === device.id && path.target.internal?.breakerHolderId === endpoint.id));
  }
  function inspectEndpoint(shelf: Shelf, frame: Frame, panel: Panel, endpoint: BreakerHolder) {
    setSelection(endpoint.id);
    setInspection({ name: endpoint.label, kind: endpoint.variant, sections: [{ title: 'Electrical context', fields: [
      { label: 'BDFB', value: device.name }, { label: 'Shelf', value: shelf.label },
      { label: 'Frame', value: frame.label }, { label: 'Panel', value: panel.label },
      { label: 'Capacity', value: endpoint.capacity ?? 'Not specified' },
      { label: 'Connections', value: powerReadable ? endpointLinks(endpoint).length : 'Restricted' },
    ] }], actions: [{ label: 'Open electrical endpoint', href: link({ shelf: shelf.id, panel: panel.id, endpoint: endpoint.id }) }] });
  }
  function board(shelf: Shelf, frame: Frame, panel: Panel, expanded: boolean) {
    return <article className={`studio-panel ${expanded ? 'is-expanded' : ''}`} key={panel.id}>
      <header><div><small>DISTRIBUTION PANEL</small><h2>{panel.label}</h2></div><Link href={link({ shelf: shelf.id, panel: panel.id })}>Open panel →</Link></header>
      <div className="studio-bus"><span>Distribution endpoints</span><span>{panel.endpoints.length} configured positions</span></div>
      <div className="studio-endpoint-matrix">{panel.endpoints.map((endpoint, index) => <div className="studio-endpoint-position" key={endpoint.id}>
        <button className={`studio-endpoint ${endpoint.variant.toLowerCase()} ${selection === endpoint.id || activeEndpoint?.id === endpoint.id ? 'is-selected' : ''}`}
          onClick={() => inspectEndpoint(shelf, frame, panel, endpoint)}
          onDoubleClick={() => { window.location.href = link({ shelf: shelf.id, panel: panel.id, endpoint: endpoint.id }); }} aria-label={`Inspect ${endpoint.label}`}>
          <span className="studio-terminal-number">{String(index + 1).padStart(2, '0')}</span><span className="studio-switch" aria-hidden="true" />
          <strong>{endpoint.label}</strong><small>{endpoint.capacity !== undefined ? `Capacity ${endpoint.capacity}` : endpoint.variant}</small>
          <span className="studio-assignment">{powerReadable ? (endpointLinks(endpoint).length ? 'CONNECTED' : 'UNASSIGNED') : 'CONNECTIONS RESTRICTED'}</span>
        </button>
        <Link href={link({ shelf: shelf.id, panel: panel.id, endpoint: endpoint.id })}>Open endpoint →</Link>
      </div>)}</div>
      {!panel.endpoints.length && <p>No endpoints configured on this panel.</p>}
    </article>;
  }
  function shelfView(shelf: Shelf) {
    return <section className="studio-shelf" key={shelf.id}><header><span>SHELF</span><Link href={link({ shelf: shelf.id })}>{shelf.label} →</Link></header>
      {shelf.frames.map(frame => <div key={frame.id} className={frame.presentation?.physicalFrameVisible === false ? 'studio-implicit-frame' : 'studio-frame'}>
        {frame.presentation?.physicalFrameVisible !== false && <h3>{frame.label}</h3>}
        <div className="studio-panel-field">{frame.panels.map(panel => board(shelf, frame, panel, false))}</div>
      </div>)}
    </section>;
  }
  const endpointConnections = activeEndpoint ? endpointLinks(activeEndpoint) : connections;
  const focusedConnections = activePath ? connections.filter(item => item.path.target.entityId === activePath.path.target.entityId) : endpointConnections;
  const invalidFocus = (focus.shelf && !activeShelf) || (focus.panel && !activeBoard) || (focus.endpoint && !activeEndpoint) || (focus.path && !activePath);
  return <section className="studio-device">
    <nav className="studio-local-nav" aria-label="Equipment physical context">
      <Link href={href} aria-current={!focus.shelf && !focus.path ? 'page' : undefined}>Chassis</Link>
      {activeShelf && <Link href={link({ shelf: activeShelf.id })}>{activeShelf.label}</Link>}
      {activeBoard && <><span className="studio-frame-context">{activeBoard.frame.label}{activeBoard.frame.presentation?.physicalFrameVisible === false ? ' · implicit' : ''}</span><Link href={link({ shelf: activeBoard.shelf.id, panel: activeBoard.panel.id })}>{activeBoard.panel.label}</Link></>}
      {activeEndpoint && <span>{activeEndpoint.label}</span>}
      {activePath && <span>Power trace</span>}
      <Link href={`/rack/${device.parentId}`}>↑ Rack</Link>
    </nav>
    <div className="studio-device-scroll">
      {invalidFocus ? <p role="alert">This component or power path is unavailable. <Link href={href}>Return to chassis</Link></p> : <>
      {!activePath && (shelves.length ? (activeBoard ? board(activeBoard.shelf, activeBoard.frame, activeBoard.panel, true) : (activeShelf ? [activeShelf] : shelves).map(shelfView)) :
        <div className="studio-generic-front"><span className="studio-mount-ear" aria-hidden="true" /><div className="studio-device-face"><small>{device.category ?? device.kind} · GENERIC FRONT VIEW</small><h2>{device.name}</h2><div className="studio-vent" aria-hidden="true" /><div className="studio-device-plate"><span>{uRange}</span><span>{device.lifecycle}</span></div></div><span className="studio-mount-ear" aria-hidden="true" /></div>)}
      {activeEndpoint && <div className="studio-endpoint-context"><strong>{activeEndpoint.label}</strong><span>{activeEndpoint.variant}</span><span>Capacity: {activeEndpoint.capacity ?? 'Not specified'}</span><span>{activeBoard?.shelf.label} / {activeBoard?.frame.label} / {activeBoard?.panel.label}</span></div>}
      <section className="studio-connections"><header><div><small>ELECTRICAL TOPOLOGY</small><h2>{activePath ? 'Power trace' : 'Power relationships'}</h2></div><span>Configured connections · no live telemetry</span></header>
      {!powerReadable ? <p>Your role cannot read power relationships.</p> : !focusedConnections.length ? <p>{activeEndpoint ? 'No power path assigned to this endpoint.' : 'No configured power relationships.'}</p> :
        focusedConnections.map(connection => <div className={`studio-power-trace ${connection.path.feed === 'B' ? 'feed-b' : ''}`} key={connection.path.id}>
          <div className="studio-power-source"><small>SOURCE</small><button onClick={() => setInspection({ name: connection.sourceName, kind: 'POWER SOURCE', sections: [{ title: 'Physical distribution', fields: connection.sourceTrail.map((name, index) => ({ label: ['BDFB', 'Shelf', 'Frame', 'Panel', 'Endpoint'][index] ?? 'Context', value: name })) }], actions: [{ label: 'Open source endpoint', href: connection.sourceHref }] })}>{connection.sourceName}</button><span>{connection.sourceTrail.slice(1).join(' / ')}</span><Link href={connection.sourceHref}>Open source →</Link></div>
          <div className="studio-feed"><span>{connection.path.feed ? `FEED ${connection.path.feed}` : 'FEED UNSPECIFIED'}</span><svg viewBox="0 0 200 30" aria-hidden="true"><path d="M0 15H192M181 5L193 15L181 25" /></svg><Link href={link({ ...(focus.shelf ? { shelf: focus.shelf } : {}), ...(focus.panel ? { panel: focus.panel } : {}), ...(focus.endpoint ? { endpoint: focus.endpoint } : {}), path: connection.path.id })}>Trace connection</Link></div>
          <div className="studio-power-target"><small>DESTINATION</small><Link href={connection.targetHref}>{connection.targetName} →</Link><span>{connection.path.label ?? 'Configured power path'}</span></div>
        </div>)}
      </section>
      <div className="studio-device-facts"><span>{rack?.name ?? 'Rack unavailable'} · {uRange}</span><span>Serial: {device.serialNumber ?? 'Not specified'}</span><button onClick={() => setInspection(topologyInspector(device, href))}>Inspect identity</button></div>
      </>}
    </div>
    {inspection && <EntityInspector entity={inspection} onClose={() => setInspection(null)} />}
  </section>;
}
