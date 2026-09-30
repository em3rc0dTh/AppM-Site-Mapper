'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';

import type { PhysicalPoint, TopologyNode } from '@/modules/topology/domain/entities';

import type { VisualStageChild } from './topology-visual-stage';

function displayKind(kind: TopologyNode['kind']) {
  if (kind === 'ROOM_SUBSTRUCTURE') return 'ROOM';
  return kind.replaceAll('_', ' ');
}

function nodeGlyph(kind: TopologyNode['kind']) {
  switch (kind) {
    case 'SITE':
      return '▥';
    case 'STRUCTURE':
      return '▦';
    case 'LEVEL':
      return '▤';
    case 'ROOM_SUBSTRUCTURE':
      return '▭';
    default:
      return '▥';
  }
}

export function TopologyExplorer({
  node,
  items,
  boundary,
}: {
  node: TopologyNode;
  items: readonly VisualStageChild[];
  boundary?: readonly PhysicalPoint[] | undefined;
}) {
  const [selected, setSelected] = useState<string | null>(
    null,
  );
  const [zoom, setZoom] = useState(1);
  const item = items.find((entry) => entry.node.id === selected);
  const visualItems =
    node.kind === 'NETWORK'
      ? [...items].sort((a, b) => {
          const order = ['Lima', 'Arequipa', 'Trujillo'];
          return order.indexOf(a.node.name) - order.indexOf(b.node.name);
        })
      : items;
  const polygons = items.flatMap((entry) =>
    'polygon' in entry.node && entry.node.polygon ? [...entry.node.polygon] : [],
  );
  const all = [...(boundary ?? []), ...polygons];
  const hasGeometry = polygons.length > 0 && (node.kind === 'LEVEL' || node.kind === 'SITE');
  const minX = Math.min(...all.map((point) => point.x), 0);
  const minY = Math.min(...all.map((point) => point.y), 0);
  const width = Math.max(...all.map((point) => point.x), 1200) - minX;
  const height = Math.max(...all.map((point) => point.y), 1200) - minY;
  const pad = Math.max(width, height) * 0.1;
  const points = (polygon: readonly PhysicalPoint[]) =>
    polygon.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <section className={`mk-explorer zip-explorer zip-explorer--${node.kind.toLowerCase()}`}>
      <div className="mk-explorer-main zip-explorer-main">
        <header className="zip-canvas-title">
          <strong>
            {node.kind === 'NETWORK'
              ? 'NETWORK'
              : node.kind === 'SITE'
                ? `SITE: ${node.name.toUpperCase()}`
                : node.kind === 'STRUCTURE'
                  ? node.name.toUpperCase()
                  : node.name.toUpperCase()}
          </strong>
          <small>{hasGeometry ? 'SURVEYED GEOMETRY' : 'SCHEMATIC · NO SURVEYED COORDINATES'}</small>
        </header>

        <div className="mk-map-canvas zip-map-canvas">
          <div className="mk-map-zoom" style={{ transform: `scale(${zoom})` }}>
            {node.kind === 'STRUCTURE' ? (
              <div className="zip-building-stack">
                {[...items].reverse().map((entry, index) => (
                  <button
                    key={entry.node.id}
                    className={`zip-floor-slab ${selected === entry.node.id ? 'is-selected' : ''}`}
                    onClick={() => setSelected(entry.node.id)}
                    onDoubleClick={() => window.location.assign(entry.href)}
                    style={{ '--floor-order': index } as CSSProperties}
                  >
                    <span className="zip-floor-shape" />
                    <span>
                      <strong>{entry.node.name.toUpperCase()}</strong>
                      <small>{index === items.length - 1 ? 'BASEMENT' : 'LEVEL'}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : hasGeometry ? (
              <div className="zip-level-stage">
                <svg
                  viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`}
                  aria-label="Physical level layout"
                >
                  {boundary && <polygon points={points(boundary)} className="mk-map-boundary" />}
                  {items.map((entry) => {
                    const polygon = 'polygon' in entry.node ? entry.node.polygon : undefined;
                    if (!polygon?.length) return null;
                    const centerX =
                      polygon.reduce((sum, value) => sum + value.x, 0) / polygon.length;
                    const centerY =
                      polygon.reduce((sum, value) => sum + value.y, 0) / polygon.length;
                    return (
                      <g
                        key={entry.node.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`Select ${entry.node.name}`}
                        onClick={() => setSelected(entry.node.id)}
                        onDoubleClick={() => window.location.assign(entry.href)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') setSelected(entry.node.id);
                        }}
                      >
                        <polygon
                          points={points(polygon)}
                          className={selected === entry.node.id ? 'is-selected' : ''}
                        />
                        <text x={centerX} y={centerY} textAnchor="middle">
                          {entry.node.name.toUpperCase()}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="zip-level-minimap" aria-hidden="true">
                  <b>MINI MAP</b>
                  <span />
                </div>
              </div>
            ) : node.kind === 'LEVEL' ? (
              <div className="topology-unlocated-list" aria-label="Rooms without surveyed geometry">
                <p>Room footprints are not surveyed. This is a topology list, not a physical map.</p>
                <div>
                  {visualItems.map((entry) => (
                    <button key={entry.node.id} type="button"
                      className={selected === entry.node.id ? 'is-selected' : ''}
                      onClick={() => setSelected(entry.node.id)}
                      onDoubleClick={() => window.location.assign(entry.href)}>
                      <strong>{entry.node.name}</strong>
                      <small>Click to inspect · double click to open</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`zip-network-graph zip-network-graph--${node.kind.toLowerCase()}`}>
                <div className="zip-graph-title">
                  {node.kind === 'NETWORK' ? 'GLOBAL NETWORK' : node.name.toUpperCase()}
                </div>
                <div className="zip-graph-links" aria-hidden="true" />
                {visualItems.map((entry, index) => (
                  <button
                    key={entry.node.id}
                    className={`zip-graph-card zip-graph-card--${index + 1} ${selected === entry.node.id ? 'is-selected' : ''}`}
                    onClick={() => setSelected(entry.node.id)}
                    onDoubleClick={() => window.location.assign(entry.href)}
                  >
                    <span className="zip-graph-glyph" aria-hidden="true">
                      {nodeGlyph(entry.node.kind)}
                    </span>
                    <strong>
                      {node.kind === 'NETWORK'
                        ? ((
                            {
                              Lima: 'SITE LIM',
                              Arequipa: 'SITE ARE',
                              Trujillo: 'SITE TRU',
                            } as Record<string, string>
                          )[entry.node.name] ?? entry.node.name.toUpperCase())
                        : entry.node.name.toUpperCase()}
                    </strong>
                    <span className="zip-graph-metrics">
                      <small>SCHEMATIC · UNSURVEYED</small>
                    </span>
                  </button>
                ))}

              </div>
            )}
          </div>
        </div>

        <footer className="zip-canvas-footer">
          <span>{node.kind === 'NETWORK' ? 'Network' : node.name}</span>
          <span className="zip-grid-indicator">{hasGeometry ? '▦ SURVEYED' : 'SCHEMATIC'}</span>
          <div className="zip-zoom-controls">
            <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}>−</button>
            <b>{Math.round(zoom * 100)}%</b>
            <button onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>+</button>
          </div>
          <button onClick={() => setZoom(1)}>⌗ FIT VIEW</button>
          <strong className="zip-synced">● SYNCED</strong>
        </footer>
      </div>

      <aside className="mk-inline-inspector zip-inspector">
        <header className="zip-inspector-heading">
          <strong>INSPECTOR</strong>
          <span>⌄</span>
        </header>
        <div className="zip-inspector-identity">
          <span className="zip-inspector-glyph">{nodeGlyph(item?.node.kind ?? node.kind)}</span>
          <div>
            <h2>{(item?.node.name ?? node.name).toUpperCase()}</h2>
            <small>
              {node.name} / {item?.node.name ?? node.name}
            </small>
          </div>
        </div>
        <section>
          <h3>GENERAL INFORMATION</h3>
          <dl>
            <dt>Name</dt>
            <dd>{item?.node.name ?? node.name}</dd>
            <dt>Type</dt>
            <dd>{displayKind(item?.node.kind ?? node.kind)}</dd>
            <dt>Contained</dt>
            <dd>{items.length}</dd>
            <dt>Status</dt>
            <dd>● Active</dd>
          </dl>
        </section>
        <section className="topology-telemetry-note">
          <h3>TELEMETRY</h3>
          <p>Live status appears on a mapped device or breaker. Topology alone does not prove connectivity.</p>
        </section>
        {item ? (
          <Link className="mk-primary zip-open-action" href={item.href}>
            ↗ OPEN {item.node.kind === 'ROOM_SUBSTRUCTURE' ? 'ROOM' : displayKind(item.node.kind)}
          </Link>
        ) : (
          <p>Select an object to inspect its properties.</p>
        )}
      </aside>
    </section>
  );
}
