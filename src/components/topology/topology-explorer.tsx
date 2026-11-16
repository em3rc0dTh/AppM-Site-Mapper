'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  isValidPolygon,
  polygonArea,
  polygonsOverlapArea,
} from '@/modules/spatial/domain/geometry';
import { useState } from 'react';

import type { PhysicalPoint, TopologyNode } from '@/modules/topology/domain/entities';
import { ThradexAttribution } from '@/shared/ui/thradex-attribution';

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
  const focusedNode = item?.node ?? node;
  const focusedPolygon = 'polygon' in focusedNode ? focusedNode.polygon : undefined;
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
          {node.kind !== 'NETWORK' && (
            <small>{hasGeometry ? t('surveyed') : t('schematicNoCoordinates')}</small>
          )}
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
              <div className="mk2-building-stage" aria-label={t('structureLevels')}>
                <div className="mk2-building-illustration">
                  <div className="mk2-building-shell" aria-hidden="true">
                    <div className="mk2-building-roof" />
                    <div className="mk2-building-windows" />
                  </div>
                  <div className="mk2-building-floor-list">
                    {items.map((entry) => (
                      <Link
                        key={entry.node.id}
                        href={entry.href}
                        className="mk2-building-floor"
                        onMouseEnter={() => setSelected(entry.node.id)}
                        onFocus={() => setSelected(entry.node.id)}
                        aria-label={t('openNamed', { name: entry.node.name })}
                      >
                        <span>
                          <strong>{entry.node.name}</strong>
                          <small>{t('levelItem')}</small>
                        </span>
                        <b>{t('enter')}</b>
                      </Link>
                    ))}
                    {items.length === 0 && (
                      <span className="mk2-building-no-floors">{t('noItems')}</span>
                    )}
                  </div>
                </div>
                <p className="mk2-building-caption">{t('illustrativeBuilding')}</p>
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
                    // Persisted survey coordinates determine label placement.
                    // SVG font size scales with the survey envelope rather than using
                    // a fixed 48-unit text that becomes unreadable on large plans.
                    const scale = (width + pad * 2) / 900;
                    const polygonWidth = Math.max(
                      1,
                      Math.max(...polygon.map((point) => point.x)) -
                        Math.min(...polygon.map((point) => point.x)),
                    );
                    const fontSize = Math.min(
                      19 * scale,
                      Math.max(11 * scale, (polygonWidth * 0.8) / (entry.node.name.length * 0.6)),
                    );
                    const labelWidth = Math.min(
                      polygonWidth * 0.9,
                      (entry.node.name.length * 0.62 + 3) * fontSize,
                    );
                    return (
                      <a
                        key={entry.node.id}
                        href={entry.href}
                        className="mk2-map-element"
                        onMouseEnter={() => setSelected(entry.node.id)}
                        onFocus={() => setSelected(entry.node.id)}
                        aria-label={t('openNamed', { name: entry.node.name })}
                      >
                        <title>{t('openNamed', { name: entry.node.name })}</title>
                        <polygon
                          points={points(polygon)}
                          className={selected === entry.node.id ? 'is-selected' : ''}
                        />
                        <rect
                          x={centerX - labelWidth / 2}
                          y={centerY - fontSize * 1.35}
                          width={labelWidth}
                          height={fontSize * 2.7}
                          rx={fontSize * 0.27}
                          className="mk2-map-nameplate"
                        />
                        <text
                          x={centerX}
                          y={centerY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          style={{ fontSize }}
                        >
                          {entry.node.name.toUpperCase()}
                        </text>
                      </a>
                    );
                  })}
                </svg>
                {unlocated.length > 0 && (
                  <div className="topology-unlocated-inline" aria-label={t('unsurveyedInventory')}>
                    <strong>{t('unlocated', { count: unlocated.length })}</strong>
                    {unlocated.map((entry) => (
                      <Link
                        key={entry.node.id}
                        href={entry.href}
                        className={selected === entry.node.id ? 'is-selected' : ''}
                        onMouseEnter={() => setSelected(entry.node.id)}
                        onFocus={() => setSelected(entry.node.id)}
                      >
                        {entry.node.name} ↗
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : node.kind === 'LEVEL' ? (
              <div className="topology-unlocated-list" aria-label={t('roomsUnsurveyed')}>
                <p>{t('noMapWarning')}</p>
                <div>
                  {visualItems.map((entry) => (
                    <Link
                      key={entry.node.id}
                      href={entry.href}
                      className={selected === entry.node.id ? 'is-selected' : ''}
                      onMouseEnter={() => setSelected(entry.node.id)}
                      onFocus={() => setSelected(entry.node.id)}
                    >
                      <strong>{entry.node.name}</strong>
                      <small>{t('openAction')}</small>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`zip-network-graph zip-network-graph--${node.kind.toLowerCase()}`}>
                <div className="mk2-network-cards">
                  {visualItems.map((entry) => (
                    <Link
                      key={entry.node.id}
                      href={entry.href}
                      className="zip-graph-card"
                      onMouseEnter={() => setSelected(entry.node.id)}
                      onFocus={() => setSelected(entry.node.id)}
                      aria-label={t('openNamed', { name: entry.node.name })}
                    >
                      <span className="zip-graph-glyph" aria-hidden="true">
                        {nodeGlyph(entry.node.kind)}
                      </span>
                      <strong>{entry.node.name.toUpperCase()}</strong>
                      <small>{displayKind(entry.node.kind)}</small>
                    </Link>
                  ))}
                  {visualItems.length === 0 && (
                    <span className="mk2-network-empty">{t('noItems')}</span>
                  )}
                </div>
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

        </footer>
      </div>

      <aside className="mk-inline-inspector zip-inspector">
        <header className="zip-inspector-heading">
          <strong>{t('inspector')}</strong>
          <span>⌄</span>
        </header>
        <div className="zip-inspector-identity">
          <span className="zip-inspector-glyph">{nodeGlyph(item?.node.kind ?? node.kind)}</span>
          <div>
            <h2>{(item?.node.name ?? node.name).toUpperCase()}</h2>
            <small>
              {displayKind(focusedNode.kind)}
            </small>
          </div>
        </div>
        <section>
          <h3>{t('info')}</h3>
          <dl>
            <dt>{t('type')}</dt>
            <dd>{displayKind(focusedNode.kind)}</dd>
            <dt>{t('contained')}</dt>
            <dd>{item ? (item.directChildCount ?? '—') : items.length}</dd>
            <dt>{t('status')}</dt>
            <dd>{focusedNode.lifecycle === 'ACTIVE' ? t('active') : t('archived')}</dd>
            {focusedPolygon && focusedPolygon.length >= 3 && (
              <>
                <dt>{t('boundary')}</dt>
                <dd>{t('vertices', { count: focusedPolygon.length })}</dd>
              </>
            )}
            {focusedPolygon && isValidPolygon(focusedPolygon) && (
              <>
                <dt>{t('area')}</dt>
                <dd>{(polygonArea(focusedPolygon) / 1_000_000).toFixed(2)} m²</dd>
              </>
            )}
          </dl>
        </section>
        {item ? (
          <Link className="mk-primary zip-open-action" href={item.href}>
            ↗ {t('openAction')}{' '}
            {item.node.kind === 'ROOM_SUBSTRUCTURE' ? t('roomType') : displayKind(item.node.kind)}
          </Link>
        ) : null}
        <ThradexAttribution variant="inspector" />
      </aside>
    </section>
  );
}
