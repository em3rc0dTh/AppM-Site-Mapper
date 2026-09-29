'use client';

import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useRouter } from 'next/navigation';

import { InlineInspector } from '@/shared/ui/inline-inspector';
import { type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';
import type {
  ClusterPlacementView,
  RackPlacementView,
} from '@/modules/spatial/application/spatial-service';
import { gridCoordinateToPoint } from '@/modules/spatial/domain/grid';
import type { PointMm, RectMm } from '@/modules/spatial/domain/geometry';

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
      label: (()=>{let n=index+1,s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;})(),
      y: minY + index * tile + tile / 2,
    })),
  };
}

function polygonCentroid(points: readonly PointMm[]): PointMm {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function BlueprintCanvas({
  polygon,
  clusters,
  racks,
  slots,
  positions = [],
  onSelectPosition,
  onSelectRack,
  focusRackId,
}: Readonly<{
  polygon: readonly PointMm[];
  clusters: readonly ClusterPlacementView[];
  racks: readonly RackPlacementView[];
  slots: readonly RectMm[];
  positions?: readonly {id:string;name:string;row:string;column:number;occupied:boolean}[];
  onSelectPosition?: ((id:string)=>void) | undefined;
  onSelectRack?: ((id:string)=>void) | undefined;
  focusRackId?: string | undefined;
}>) {
  const router = useRouter();
  const base = useMemo(() => boundsFor(polygon), [polygon]);
  const labels = useMemo(() => gridLabels(polygon), [polygon]);
  const focusedRack = racks.find((rack) => rack.id === focusRackId);
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(focusRackId ?? null);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  function inspectRack(rack: RackPlacementView) {
    setSelectedRackId(rack.id);
    if(onSelectRack){onSelectRack(rack.id);return;}
    setSelected({
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
      actions: [{ label: 'Open rack focus', href: `/rack/${rack.id}/focus` }],
    });
  }
  const [zoom, setZoom] = useState(focusedRack ? 2 : 1);
  const [pan, setPan] = useState(() =>
    focusedRack
      ? {
          x: focusedRack.rect.x - base.x - base.width / 4,
          y: focusedRack.rect.y - base.y - base.height / 4,
        }
      : { x: 0, y: 0 },
  );
  const pointer = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

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

    if (!start || !svg) {
      return;
    }

    const box = svg.getBoundingClientRect();
    const dx = ((event.clientX - start.x) / box.width) * view.width;
    const dy = ((event.clientY - start.y) / box.height) * view.height;

    setPan((current) => ({ x: current.x - dx, y: current.y - dy }));
    pointer.current = { x: event.clientX, y: event.clientY };
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="blueprint-panel">
      <header className="blueprint-toolbar zip-blueprint-toolbar">
        <div>
          <small>2D DRAFTING VIEW</small>
          <strong>Room blueprint</strong>
          <span>600 × 600 mm grid · {Math.round(zoom * 100)}%</span>
        </div>
        <div className="zip-blueprint-mode">
          <span className="zip-blueprint-mode-dot" />
          <b>VIEW MODE</b>
        </div>
      </header>

      <div className="blueprint-canvas-shell zip-blueprint-shell">
        <div className="zip-drafting-tools" aria-label="Drafting tools">
          <button
            type="button"
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
            title="Select"
          >
            ↖
          </button>
          <button
            type="button"
            aria-pressed={tool === 'pan'}
            onClick={() => setTool('pan')}
            title="Pan"
          >
            ✥
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(5, value * 1.2))}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.5, value / 1.2))}
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Fit"
          >
            ⌂
          </button>
        </div>
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

          {clusters.map((cluster) => {
            if (!cluster.polygon || cluster.polygon.length < 3) return null;
            const center = polygonCentroid(cluster.polygon);

            return (
              <g key={cluster.id} className="blueprint-cluster-node">
                <polygon
                  points={cluster.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                  className="blueprint-cluster"
                />
                <text
                  x={center.x}
                  y={center.y - 250}
                  textAnchor="middle"
                  className="blueprint-cluster-label"
                >
                  {cluster.name.toUpperCase()}
                </text>
              </g>
            );
          })}

          {positions.filter(p=>!p.occupied).map(position=>{let point;try{point=gridCoordinateToPoint(position);}catch{return null;}return <g key={position.id} role="button" tabIndex={0} aria-label={`Available ${position.name}`} onClick={()=>onSelectPosition?.(position.id)} onKeyDown={e=>{if(e.key==='Enter')onSelectPosition?.(position.id);}}><rect x={point.x} y={point.y} width="600" height="600" className="blueprint-slot"/><text x={point.x+300} y={point.y+300} textAnchor="middle" className="blueprint-cluster-label">{onSelectPosition?'+ ADD':position.name}</text></g>;})}
          {slots.map((slot) => (
            <rect
              key={rectKey(slot)}
              x={slot.x}
              y={slot.y}
              width={slot.width}
              height={slot.depth}
              className="blueprint-slot"
            />
          ))}

          {racks.map((rack) => (
            <g
              key={rack.id}
              className={`blueprint-rack-node${selectedRackId === rack.id ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${rack.name}`}
              onClick={() => {
                if (tool === 'select') inspectRack(rack);
              }}
              onDoubleClick={() => {
                if (tool === 'select' && !onSelectRack) router.push(`/rack/${rack.id}/focus`);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  inspectRack(rack);
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
                x={rack.rect.x + Math.min(65, rack.rect.width * 0.12)}
                y={rack.rect.y + Math.min(65, rack.rect.depth * 0.12)}
                width={Math.max(1, rack.rect.width - Math.min(130, rack.rect.width * 0.24))}
                height={Math.max(1, rack.rect.depth - Math.min(130, rack.rect.depth * 0.24))}
                className="blueprint-rack-inner"
                aria-hidden="true"
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
          ))}
        </svg>
        <div className="blueprint-canvas-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <footer className="blueprint-legend">
        <StatusBadge tone="accent">{clusters.length} CLUSTERS</StatusBadge>
        <StatusBadge tone="accent">{racks.length} RACK FOOTPRINTS</StatusBadge>
        <StatusBadge>{slots.length} ASSIGNABLE TILES</StatusBadge>
        <span>
          {tool === 'pan'
            ? 'Drag to pan · scroll to zoom'
            : 'Select a rack to inspect · scroll to zoom'}
        </span>
      </footer>
      {selected && (
        <InlineInspector
          entity={selected}
          onClose={() => {
            setSelected(null);
            setSelectedRackId(null);
          }}
        />
      )}
    </section>
  );
}
