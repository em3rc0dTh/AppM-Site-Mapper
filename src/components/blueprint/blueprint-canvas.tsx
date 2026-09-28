'use client';

import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useRouter } from 'next/navigation';

import type {
  ClusterPlacementView,
  PositionPlacementView,
  RackPlacementView,
} from '@/modules/spatial/application/spatial-service';
import { pointInPolygon, type PointMm, type RectMm } from '@/modules/spatial/domain/geometry';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

interface ViewState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function boundsFor(polygon: readonly PointMm[]): ViewState {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 600;

  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 1200),
    height: Math.max(maxY - minY + padding * 2, 1200),
  };
}

function rectKey(rect: RectMm): string {
  return `${rect.x}:${rect.y}:${rect.width}:${rect.depth}`;
}

function gridLabels(polygon: readonly PointMm[]) {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const tile = 600;
  const columns = Math.max(1, Math.ceil((maxX - minX) / tile));
  const rows = Math.max(1, Math.ceil((maxY - minY) / tile));

  return {
    minX,
    minY,
    columns: Array.from({ length: columns }, (_, index) => ({
      label: String(index + 1),
      x: minX + index * tile + tile / 2,
    })),
    rows: Array.from({ length: rows }, (_, index) => ({
      label: String.fromCharCode(65 + index),
      y: minY + index * tile + tile / 2,
    })),
  };
}

function polygonBounds(points: readonly PointMm[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function slotCenter(slot: RectMm): PointMm {
  return {
    x: slot.x + slot.width / 2,
    y: slot.y + slot.depth / 2,
  };
}

function slotCluster(
  slot: RectMm,
  clusters: readonly ClusterPlacementView[],
): ClusterPlacementView | undefined {
  const center = slotCenter(slot);
  return clusters.find((cluster) => cluster.polygon && pointInPolygon(center, cluster.polygon));
}

function clusterInspector(
  cluster: ClusterPlacementView,
  positions: readonly PositionPlacementView[],
  racks: readonly RackPlacementView[],
): InspectorEntity {
  return {
    name: cluster.name,
    kind: 'CLUSTER / BAY',
    sections: [
      {
        title: 'Physical context',
        fields: [
          {
            label: 'Positions',
            value: positions.filter((position) => position.clusterId === cluster.id).length,
          },
          {
            label: 'Racks',
            value: racks.filter((rack) => rack.clusterId === cluster.id).length,
          },
        ],
      },
    ],
  };
}

function rackInspector(rack: RackPlacementView): InspectorEntity {
  return {
    name: rack.name,
    kind: 'CONTAINER / RACK',
    sections: [
      {
        title: 'Physical',
        fields: [
          { label: 'Footprint', value: `${rack.rect.width} × ${rack.rect.depth} mm` },
          { label: 'Coordinates', value: `X ${rack.rect.x} / Y ${rack.rect.y} mm` },
        ],
      },
    ],
    actions: [{ label: 'Open rack elevation', href: `/rack/${rack.id}` }],
  };
}

export function BlueprintCanvas({
  polygon,
  clusters,
  positions,
  racks,
  slots,
  focusId,
}: Readonly<{
  polygon: readonly PointMm[];
  clusters: readonly ClusterPlacementView[];
  positions: readonly PositionPlacementView[];
  racks: readonly RackPlacementView[];
  slots: readonly RectMm[];
  focusId?: string;
}>) {
  const router = useRouter();
  const base = useMemo(() => boundsFor(polygon), [polygon]);
  const labels = useMemo(() => gridLabels(polygon), [polygon]);
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointer = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const focusedClusterId = clusters.some((cluster) => cluster.id === focusId)
    ? focusId
    : positions.find((position) => position.id === focusId)?.clusterId;
  const focusedPositionId = positions.some((position) => position.id === focusId)
    ? focusId
    : undefined;

  const view: ViewState = {
    x: base.x + pan.x,
    y: base.y + pan.y,
    width: base.width / zoom,
    height: base.height / zoom,
  };

  function wheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((current) => Math.min(5, Math.max(0.5, current * (event.deltaY > 0 ? 0.9 : 1.1))));
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (tool !== 'pan') return;
    pointer.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = pointer.current;
    const svg = svgRef.current;

    if (!start || !svg) return;

    const box = svg.getBoundingClientRect();
    const dx = ((event.clientX - start.x) / box.width) * view.width;
    const dy = ((event.clientY - start.y) / box.height) * view.height;

    setPan((current) => ({ x: current.x - dx, y: current.y - dy }));
    pointer.current = { x: event.clientX, y: event.clientY };
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="blueprint-panel zip-room-blueprint">
      <div className="blueprint-canvas-shell">
        <svg
          ref={svgRef}
          className="blueprint-canvas"
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          onWheel={wheel}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          role="group"
          aria-label="Room blueprint"
        >
          <defs>
            <pattern id="grid600" width="600" height="600" patternUnits="userSpaceOnUse">
              <path d="M 600 0 L 0 0 0 600" className="blueprint-grid-line" />
            </pattern>
          </defs>

          <polygon
            points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
            className="blueprint-room"
          />
          <polygon
            points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="url(#grid600)"
            className="blueprint-grid"
          />

          <g className="blueprint-coordinate-labels" aria-hidden="true">
            {labels.columns.map((column) => (
              <text
                key={`column-${column.label}`}
                x={column.x}
                y={labels.minY - 115}
                textAnchor="middle"
              >
                {column.label}
              </text>
            ))}
            {labels.rows.map((row) => (
              <text
                key={`row-${row.label}`}
                x={labels.minX - 115}
                y={row.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {row.label}
              </text>
            ))}
          </g>

          {slots.map((slot) => {
            const cluster = slotCluster(slot, clusters);
            const isClusterSlot = Boolean(cluster);
            const isFocused = cluster?.id === focusedClusterId;

            return (
              <g key={rectKey(slot)} className={isFocused ? 'is-focused' : undefined}>
                <rect
                  x={slot.x}
                  y={slot.y}
                  width={slot.width}
                  height={slot.depth}
                  className={
                    isClusterSlot ? 'blueprint-slot blueprint-slot--cluster' : 'blueprint-slot'
                  }
                />
                {isClusterSlot && (
                  <text
                    x={slot.x + slot.width / 2}
                    y={slot.y + slot.depth / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="blueprint-slot-add"
                  >
                    + ADD
                  </text>
                )}
              </g>
            );
          })}

          {clusters.map((cluster) => {
            if (!cluster.polygon || cluster.polygon.length < 3) return null;
            const bounds = polygonBounds(cluster.polygon);
            const focused = cluster.id === focusedClusterId;

            return (
              <g
                key={cluster.id}
                className={`blueprint-cluster-node${focused ? ' is-focused' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(clusterInspector(cluster, positions, racks))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(clusterInspector(cluster, positions, racks));
                  }
                }}
              >
                <polygon
                  points={cluster.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                  className="blueprint-cluster"
                />
                <text
                  x={bounds.x}
                  y={bounds.y - 70}
                  textAnchor="start"
                  className="blueprint-cluster-label"
                >
                  {cluster.name.toUpperCase()}
                </text>
              </g>
            );
          })}

          {positions.map((position) => (
            <rect
              key={position.id}
              x={position.rect.x}
              y={position.rect.y}
              width={position.rect.width}
              height={position.rect.depth}
              className={`blueprint-position-focus${position.id === focusedPositionId ? ' is-focused' : ''}`}
              aria-hidden="true"
            />
          ))}

          {racks.map((rack) => {
            const focused =
              rack.positionId === focusedPositionId || rack.clusterId === focusedClusterId;

            return (
              <g
                key={rack.id}
                className={`blueprint-rack-node${focused ? ' is-focused' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${rack.name}`}
                onClick={() => {
                  if (tool === 'select') setSelected(rackInspector(rack));
                }}
                onDoubleClick={() => router.push(`/rack/${rack.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    router.push(`/rack/${rack.id}`);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    setSelected(rackInspector(rack));
                  }
                }}
              >
                <rect
                  x={rack.rect.x}
                  y={rack.rect.y}
                  width={rack.rect.width}
                  height={rack.rect.depth}
                  className="blueprint-rack"
                />
                <rect
                  x={rack.rect.x + Math.min(50, rack.rect.width * 0.1)}
                  y={rack.rect.y + Math.min(50, rack.rect.depth * 0.1)}
                  width={Math.max(1, rack.rect.width - Math.min(100, rack.rect.width * 0.2))}
                  height={Math.max(1, rack.rect.depth - Math.min(100, rack.rect.depth * 0.2))}
                  className="blueprint-rack-inner"
                  aria-hidden="true"
                />
                <circle
                  cx={rack.rect.x + rack.rect.width - 70}
                  cy={rack.rect.y + 70}
                  r={18}
                  className="blueprint-rack-led"
                />
                <text
                  x={rack.rect.x + rack.rect.width / 2}
                  y={rack.rect.y + rack.rect.depth / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="blueprint-rack-label"
                >
                  {rack.name}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="zip-room-controls" aria-label="Room blueprint controls">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(5, value * 1.2))}
          >
            ⊕
          </button>
          <button
            type="button"
            aria-label={tool === 'pan' ? 'Select mode' : 'Pan mode'}
            onClick={() => setTool((value) => (value === 'pan' ? 'select' : 'pan'))}
          >
            {tool === 'pan' ? '⌖' : '⌗'}
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.5, value / 1.2))}
          >
            ⊖
          </button>
        </div>
      </div>

      <footer className="blueprint-legend zip-room-legend">
        <StatusBadge tone="accent">{clusters.length} CLUSTERS</StatusBadge>
        <StatusBadge tone="accent">{racks.length} RACKS</StatusBadge>
        <span>Click cluster or rack to inspect · double click rack to open · scroll to zoom</span>
      </footer>

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
