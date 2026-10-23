'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  isValidPolygon,
  polygonArea,
  polygonsOverlapArea,
} from '@/modules/spatial/domain/geometry';
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
  const t = useTranslations('topologyViews');
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const item = items.find((entry) => entry.node.id === selected);
  // Retain persisted ordering; never impose a demo-specific geography on MongoDB.
  const visualItems = items;
  const polygons = items.flatMap((entry) =>
    'polygon' in entry.node && entry.node.polygon ? [...entry.node.polygon] : [],
  );
  const roomPairs: string[] = [];
  if (node.kind === 'LEVEL') {
    const rooms = items.filter(
      (entry) => entry.node.kind === 'ROOM_SUBSTRUCTURE' && entry.node.polygon?.length,
    );
    for (let i = 0; i < rooms.length; i += 1) {
      for (let j = i + 1; j < rooms.length; j += 1) {
        const a = rooms[i]!.node;
        const b = rooms[j]!.node;
        if (
          a.kind === 'ROOM_SUBSTRUCTURE' &&
          b.kind === 'ROOM_SUBSTRUCTURE' &&
          a.polygon &&
          b.polygon &&
          polygonsOverlapArea(a.polygon, b.polygon)
        ) {
          roomPairs.push(`${a.name} / ${b.name}`);
        }
      }
    }
  }
  const all = [...(boundary ?? []), ...polygons];
  const hasGeometry = all.length > 0 && (node.kind === 'LEVEL' || node.kind === 'SITE');
  // Preserve the saved coordinate envelope. Anchoring it to zero distorts
  // georeferenced rooms whose surveyed origin is not (0, 0).
  const minX = all.length ? Math.min(...all.map((point) => point.x)) : 0;
  const minY = all.length ? Math.min(...all.map((point) => point.y)) : 0;
  const width = all.length ? Math.max(1, Math.max(...all.map((point) => point.x)) - minX) : 1200;
  const height = all.length ? Math.max(1, Math.max(...all.map((point) => point.y)) - minY) : 1200;
  const unlocated = items.filter(
    (entry) => !('polygon' in entry.node && entry.node.polygon?.length),
  );
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
          <small>{hasGeometry ? t('surveyed') : t('schematicNoCoordinates')}</small>
        </header>

        {roomPairs.length > 0 && (
          <div className="level-room-overlap-warning" role="alert">
            <strong>{t('conflicts', { count: roomPairs.length })}</strong>
            <span>
              {t('overlapWarning')} {roomPairs.slice(0, 3).join(' · ')}
            </span>
          </div>
        )}
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
                      <small>{entry.node.kind.replaceAll('_', ' ')}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : hasGeometry ? (
              <div className="zip-level-stage">
                <svg
                  viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`}
                  aria-label={t('physicalLevel')}
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
                        aria-label={t('select', { name: entry.node.name })}
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
                {unlocated.length > 0 && (
                  <div className="topology-unlocated-inline" aria-label={t('unsurveyedInventory')}>
                    <strong>{t('unlocated', { count: unlocated.length })}</strong>
                    {unlocated.map((entry) => (
                      <button
                        key={entry.node.id}
                        type="button"
                        className={selected === entry.node.id ? 'is-selected' : ''}
                        onClick={() => setSelected(entry.node.id)}
                        onDoubleClick={() => window.location.assign(entry.href)}
                      >
                        {entry.node.name} · {t('inspectAction')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : node.kind === 'LEVEL' ? (
              <div className="topology-unlocated-list" aria-label={t('roomsUnsurveyed')}>
                <p>
                  {t('noMapWarning')}
                </p>
                <div>
                  {visualItems.map((entry) => (
                    <button
                      key={entry.node.id}
                      type="button"
                      className={selected === entry.node.id ? 'is-selected' : ''}
                      onClick={() => setSelected(entry.node.id)}
                      onDoubleClick={() => window.location.assign(entry.href)}
                    >
                      <strong>{entry.node.name}</strong>
                      <small>{t('clickHelp')}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`zip-network-graph zip-network-graph--${node.kind.toLowerCase()}`}>
                <div className="zip-graph-title">
                  {node.kind === 'NETWORK' ? t('globalNetwork') : node.name.toUpperCase()}
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
                      <small>{t('unsurveyed')}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="zip-canvas-footer">
          <span>{node.kind === 'NETWORK' ? t('network') : node.name}</span>
          <span className="zip-grid-indicator">
            {hasGeometry ? t('surveyedTag') : t('schematic')}
          </span>
          <div className="zip-zoom-controls">
            <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}>−</button>
            <b>{Math.round(zoom * 100)}%</b>
            <button onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>+</button>
          </div>
          <button onClick={() => setZoom(1)}>{t('fit')}</button>
          <strong className="zip-synced">{t('inventory')}</strong>
        </footer>
      </div>

      <aside className="mk-inline-inspector zip-inspector">
        {node.kind === 'SITE' && (
          <div className="spatial-site-facts">
            <strong>{node.name}</strong>
            <dl>
              <dt>{t('boundary')}</dt>
              <dd>
                {boundary?.length ? t('vertices', { count: boundary.length }) : t('notDrawn')}
              </dd>
              <dt>{t('area')}</dt>
              <dd>
                {isValidPolygon(boundary)
                  ? `${(polygonArea(boundary) / 1_000_000).toFixed(2)} m²`
                  : '—'}
              </dd>
              <dt>{t('status')}</dt>
              <dd>{node.lifecycle === 'ACTIVE' ? t('active') : t('archived')}</dd>
              <dt>{t('containedObjects')}</dt>
              <dd>{items.length}</dd>
            </dl>
          </div>
        )}
        <header className="zip-inspector-heading">
          <strong>{t('inspector')}</strong>
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
          <h3>{t('info')}</h3>
          <dl>
            <dt>{t('name')}</dt>
            <dd>{item?.node.name ?? node.name}</dd>
            <dt>{t('type')}</dt>
            <dd>{displayKind(item?.node.kind ?? node.kind)}</dd>
            <dt>{t('contained')}</dt>
            <dd>{item ? (item.directChildCount ?? '—') : items.length}</dd>
            <dt>{t('status')}</dt>
            <dd>{(item?.node ?? node).lifecycle === 'ACTIVE' ? t('active') : t('archived')}</dd>
          </dl>
        </section>
        <section className="topology-telemetry-note">
          <h3>{t('telemetry')}</h3>
          <p>
            {t('liveStatusScope')}
          </p>
        </section>
        {item ? (
          <Link className="mk-primary zip-open-action" href={item.href}>
            ↗ {t('openAction')} {item.node.kind === 'ROOM_SUBSTRUCTURE' ? t('roomType') : displayKind(item.node.kind)}
          </Link>
        ) : (
          <p>{t('selectHelp')}</p>
        )}
      </aside>
    </section>
  );
}
