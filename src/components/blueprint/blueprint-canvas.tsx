'use client';

import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

import type { RackPlacementView } from '@/modules/spatial/application/spatial-service';
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

export function BlueprintCanvas({
  polygon,
  racks,
  slots,
}: Readonly<{
  polygon: readonly PointMm[];
  racks: readonly RackPlacementView[];
  slots: readonly RectMm[];
}>) {
  const base = useMemo(() => boundsFor(polygon), [polygon]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
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
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="blueprint-panel">
      <header className="blueprint-toolbar">
        <div>
          <strong>Blueprint</strong>
          <span>600 mm grid · {Math.round(zoom * 100)}%</span>
        </div>
        <div className="blueprint-actions">
          <button type="button" onClick={() => setZoom((value) => Math.min(5, value * 1.2))}>
            +
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value / 1.2))}>
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset
          </button>
        </div>
      </header>

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
        role="img"
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
          <g key={rack.id}>
            <rect
              x={rack.rect.x}
              y={rack.rect.y}
              width={rack.rect.width}
              height={rack.rect.depth}
              className="blueprint-rack"
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
    </section>
  );
}
