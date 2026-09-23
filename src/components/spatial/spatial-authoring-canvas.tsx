'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

import {
  isValidPolygon,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  type PointMm,
  type RectMm,
} from '@/modules/spatial/domain/geometry';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';

export interface SpatialContextPolygon {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly polygon: readonly PointMm[];
  readonly href?: string;
}

export interface SpatialRectOverlay {
  readonly id: string;
  readonly name: string;
  readonly kind: 'rack' | 'slot';
  readonly rect: RectMm;
  readonly href?: string;
}

interface ViewState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type Tool = 'select' | 'pan' | 'draw';

type PointerSession =
  Readonly<{ type: 'pan'; x: number; y: number }> | Readonly<{ type: 'vertex'; index: number }>;

function clonePolygon(points: readonly PointMm[]): PointMm[] {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

function rowLabel(index: number): string {
  let value = index + 1;
  let result = '';

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
}

function rectPoints(rect: RectMm): readonly PointMm[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.depth },
    { x: rect.x + rect.width, y: rect.y + rect.depth },
  ];
}

function authoringBounds(
  polygon: readonly PointMm[],
  contextPolygons: readonly SpatialContextPolygon[],
  rectangles: readonly SpatialRectOverlay[],
  gridSizeMm?: number,
): ViewState {
  const points = [
    ...polygon,
    ...contextPolygons.flatMap((context) => context.polygon),
    ...rectangles.flatMap((item) => rectPoints(item.rect)),
  ];

  const fallback: readonly PointMm[] = [
    { x: 0, y: 0 },
    { x: 6000, y: 3600 },
  ];
  const bounds = polygonBounds(points.length > 0 ? points : fallback);

  if (!bounds) {
    return { x: -600, y: -600, width: 7200, height: 4800 };
  }

  const dominant = Math.max(bounds.width, bounds.height, gridSizeMm ?? 0, 1200);
  const padding = Math.max(gridSizeMm ?? 0, dominant * 0.12, 300);

  return {
    x: bounds.minX - padding,
    y: bounds.minY - padding,
    width: Math.max(bounds.width + padding * 2, 1800),
    height: Math.max(bounds.height + padding * 2, 1800),
  };
}

function midpoint(left: PointMm, right: PointMm): PointMm {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function samePolygon(left: readonly PointMm[], right: readonly PointMm[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function SpatialAuthoringCanvas({
  entityId,
  entityName,
  entityKind,
  initialPolygon = [],
  canWrite,
  gridSizeMm,
  contextPolygons = [],
  rectangles = [],
  title = 'Spatial boundary',
  subtitle = 'Polygon geometry · millimetres',
}: Readonly<{
  entityId: string;
  entityName: string;
  entityKind: string;
  initialPolygon?: readonly PointMm[];
  canWrite: boolean;
  gridSizeMm?: number;
  contextPolygons?: readonly SpatialContextPolygon[];
  rectangles?: readonly SpatialRectOverlay[];
  title?: string;
  subtitle?: string;
}>) {
  const sourcePolygon = useMemo(() => clonePolygon(initialPolygon), [initialPolygon]);
  const base = useMemo(
    () => authoringBounds(sourcePolygon, contextPolygons, rectangles, gridSizeMm),
    [contextPolygons, gridSizeMm, rectangles, sourcePolygon],
  );
  const [draft, setDraft] = useState<PointMm[]>(sourcePolygon);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [snap, setSnap] = useState(Boolean(gridSizeMm));
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [selected, setSelected] = useState<InspectorEntity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointer = useRef<PointerSession | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const displayed = editing ? draft : sourcePolygon;
  const validDraft = draft.length >= 3 && isValidPolygon(draft);
  const dirty = editing && !samePolygon(draft, sourcePolygon);
  const areaSqm = displayed.length >= 3 ? polygonArea(displayed) / 1_000_000 : 0;

  const view: ViewState = {
    width: base.width / zoom,
    height: base.height / zoom,
    x: base.x + (base.width - base.width / zoom) / 2 + pan.x,
    y: base.y + (base.height - base.height / zoom) / 2 + pan.y,
  };

  const grid = useMemo(() => {
    if (!gridSizeMm || displayed.length < 3) {
      return null;
    }

    const bounds = polygonBounds(displayed);

    if (!bounds) {
      return null;
    }

    const startX = Math.floor(bounds.minX / gridSizeMm) * gridSizeMm;
    const startY = Math.floor(bounds.minY / gridSizeMm) * gridSizeMm;
    const columns = Math.max(1, Math.ceil((bounds.maxX - startX) / gridSizeMm));
    const rows = Math.max(1, Math.ceil((bounds.maxY - startY) / gridSizeMm));

    return {
      startX,
      startY,
      columns: Array.from({ length: columns }, (_, index) => ({
        label: String(index + 1),
        x: startX + index * gridSizeMm + gridSizeMm / 2,
      })),
      rows: Array.from({ length: rows }, (_, index) => ({
        label: rowLabel(index),
        y: startY + index * gridSizeMm + gridSizeMm / 2,
      })),
    };
  }, [displayed, gridSizeMm]);

  useEffect(() => {
    if (!editing || !dirty) {
      return;
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const guardAnchorNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest('a[href]');

      if (!anchor || anchor.getAttribute('href')?.startsWith('#')) {
        return;
      }

      if (!window.confirm('Discard unsaved boundary changes?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardAnchorNavigation, true);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardAnchorNavigation, true);
    };
  }, [dirty, editing]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedVertex !== null &&
        draft.length > 3
      ) {
        event.preventDefault();
        deleteSelectedVertex();
      }

      if (event.key === 'Enter' && tool === 'draw' && draft.length >= 3) {
        event.preventDefault();
        setTool('select');
        setSelectedVertex(0);
      }
    };

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });

  function normalizePoint(point: PointMm): PointMm {
    if (snap && gridSizeMm) {
      return {
        x: Math.round(point.x / gridSizeMm) * gridSizeMm,
        y: Math.round(point.y / gridSizeMm) * gridSizeMm,
      };
    }

    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
  }

  function toCanvasPoint(clientX: number, clientY: number): PointMm | null {
    const svg = svgRef.current;

    if (!svg) {
      return null;
    }

    const matrix = svg.getScreenCTM();

    if (!matrix) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());

    return normalizePoint({ x: transformed.x, y: transformed.y });
  }

  function beginEdit() {
    setDraft(clonePolygon(sourcePolygon));
    setEditing(true);
    setError(null);
    setSelected(null);
    setSelectedVertex(null);
    setTool(sourcePolygon.length >= 3 ? 'select' : 'draw');
  }

  function redraw() {
    setDraft([]);
    setSelectedVertex(null);
    setError(null);
    setTool('draw');
  }

  function cancel() {
    setDraft(clonePolygon(sourcePolygon));
    setEditing(false);
    setTool('select');
    setSelectedVertex(null);
    setError(null);
    pointer.current = null;
  }

  function deleteSelectedVertex() {
    if (selectedVertex === null || draft.length <= 3) {
      return;
    }

    setDraft((current) => current.filter((_, index) => index !== selectedVertex));
    setSelectedVertex(null);
  }

  function insertMidpoint(index: number) {
    const current = draft[index];
    const next = draft[(index + 1) % draft.length];

    if (!current || !next) {
      return;
    }

    const inserted = normalizePoint(midpoint(current, next));
    setDraft((points) => [...points.slice(0, index + 1), inserted, ...points.slice(index + 1)]);
    setSelectedVertex(index + 1);
  }

  function inspectRectangle(item: SpatialRectOverlay) {
    if (item.kind !== 'rack' || editing) {
      return;
    }

    setSelected({
      name: item.name,
      kind: 'CONTAINER / RACK',
      sections: [
        {
          title: 'Physical',
          fields: [
            { label: 'Footprint', value: `${item.rect.width} × ${item.rect.depth} mm` },
            { label: 'Coordinates', value: `X ${item.rect.x} / Y ${item.rect.y} mm` },
          ],
        },
      ],
      ...(item.href ? { actions: [{ label: 'Open rack elevation', href: item.href }] } : {}),
    });
  }

  function wheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    setZoom((current) => Math.min(8, Math.max(0.35, current * (event.deltaY > 0 ? 0.9 : 1.1))));
  }

  function canvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return;
    }

    if (tool === 'pan') {
      pointer.current = { type: 'pan', x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (!editing || tool !== 'draw') {
      return;
    }

    const point = toCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    setDraft((current) => [...current, point]);
    setSelectedVertex(draft.length);
  }

  function vertexPointerDown(index: number, event: PointerEvent<SVGCircleElement>) {
    if (!editing) {
      return;
    }

    event.stopPropagation();

    if (tool === 'draw' && index === 0 && draft.length >= 3) {
      setTool('select');
      setSelectedVertex(0);
      return;
    }

    if (tool !== 'select') {
      return;
    }

    setSelectedVertex(index);
    pointer.current = { type: 'vertex', index };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const session = pointer.current;

    if (!session) {
      return;
    }

    if (session.type === 'pan') {
      const box = event.currentTarget.getBoundingClientRect();
      const dx = ((event.clientX - session.x) / box.width) * view.width;
      const dy = ((event.clientY - session.y) / box.height) * view.height;

      setPan((current) => ({ x: current.x - dx, y: current.y - dy }));
      pointer.current = { type: 'pan', x: event.clientX, y: event.clientY };
      return;
    }

    const point = toCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    setDraft((current) =>
      current.map((vertex, index) => (index === session.index ? point : vertex)),
    );
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    pointer.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function save() {
    if (!validDraft || !dirty) {
      return;
    }

    setBusy(true);
    setError(null);

    const response = await fetch(`/api/spatial/boundaries/${entityId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ polygon: draft }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? 'BOUNDARY_UPDATE_FAILED');
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  return (
    <section className="spatial-authoring">
      <header className="spatial-authoring-toolbar">
        <div className="spatial-authoring-title">
          <strong>{title}</strong>
          <span>
            {subtitle} · {Math.round(zoom * 100)}%
          </span>
        </div>

        <div className="spatial-authoring-actions">
          <button type="button" aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
            Select
          </button>
          <button type="button" aria-pressed={tool === 'pan'} onClick={() => setTool('pan')}>
            Pan
          </button>

          {editing && (
            <>
              <button type="button" aria-pressed={tool === 'draw'} onClick={() => setTool('draw')}>
                Add points
              </button>
              <button type="button" onClick={redraw}>
                Redraw
              </button>
              {gridSizeMm && (
                <button
                  type="button"
                  aria-pressed={snap}
                  onClick={() => setSnap((value) => !value)}
                >
                  Snap {snap ? 'ON' : 'OFF'}
                </button>
              )}
              {selectedVertex !== null && draft.length > 3 && (
                <button type="button" onClick={deleteSelectedVertex}>
                  Delete vertex
                </button>
              )}
              {tool === 'draw' && draft.length >= 3 && (
                <button type="button" onClick={() => setTool('select')}>
                  Close shape
                </button>
              )}
            </>
          )}

          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(8, value * 1.2))}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.35, value / 1.2))}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Fit
          </button>

          {!editing && canWrite && (
            <button className="spatial-edit-cta" type="button" onClick={beginEdit}>
              {sourcePolygon.length >= 3 ? 'Edit boundary' : 'Draw boundary'}
            </button>
          )}
        </div>
      </header>

      <div className={`spatial-authoring-canvas-shell${editing ? ' is-editing' : ''}`}>
        <div className="spatial-authoring-hud">
          <span>{editing ? 'EDIT MODE' : 'READ MODE'}</span>
          <b>{entityKind}</b>
          <strong>{entityName}</strong>
        </div>

        <svg
          ref={svgRef}
          className={`spatial-authoring-canvas tool-${tool}`}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          onWheel={wheel}
          onPointerDown={canvasPointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          role="group"
          aria-label={`${entityName} spatial boundary`}
        >
          <defs>
            {gridSizeMm && (
              <pattern
                id={`spatial-grid-${entityId}`}
                width={gridSizeMm}
                height={gridSizeMm}
                patternUnits="userSpaceOnUse"
              >
                <path d={`M ${gridSizeMm} 0 L 0 0 0 ${gridSizeMm}`} className="spatial-grid-line" />
              </pattern>
            )}
          </defs>

          {contextPolygons.map((context) => {
            const center = polygonCentroid(context.polygon);
            return (
              <g key={context.id} className="spatial-context-shape">
                <polygon
                  points={context.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                />
                {center && (
                  <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="middle">
                    {context.name}
                  </text>
                )}
              </g>
            );
          })}

          {displayed.length >= 3 && (
            <>
              <polygon
                points={displayed.map((point) => `${point.x},${point.y}`).join(' ')}
                className="spatial-boundary"
              />
              {gridSizeMm && (
                <polygon
                  points={displayed.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill={`url(#spatial-grid-${entityId})`}
                  className="spatial-boundary-grid"
                />
              )}
            </>
          )}

          {displayed.length > 0 && displayed.length < 3 && (
            <polyline
              points={displayed.map((point) => `${point.x},${point.y}`).join(' ')}
              className="spatial-draft-line"
            />
          )}

          {grid && (
            <g className="spatial-coordinate-labels" aria-hidden="true">
              {grid.columns.map((column) => (
                <text
                  key={`column-${column.label}`}
                  x={column.x}
                  y={grid.startY - Math.max(90, gridSizeMm! * 0.16)}
                  textAnchor="middle"
                >
                  {column.label}
                </text>
              ))}
              {grid.rows.map((row) => (
                <text
                  key={`row-${row.label}`}
                  x={grid.startX - Math.max(90, gridSizeMm! * 0.16)}
                  y={row.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {row.label}
                </text>
              ))}
            </g>
          )}

          {rectangles.map((item) =>
            item.kind === 'slot' ? (
              <rect
                key={item.id}
                x={item.rect.x}
                y={item.rect.y}
                width={item.rect.width}
                height={item.rect.depth}
                className="spatial-slot"
              />
            ) : (
              <g
                key={item.id}
                className="spatial-rack"
                role="button"
                tabIndex={editing ? -1 : 0}
                onClick={() => inspectRectangle(item)}
                onKeyDown={(event) => {
                  if (!editing && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    inspectRectangle(item);
                  }
                }}
              >
                <rect
                  x={item.rect.x}
                  y={item.rect.y}
                  width={item.rect.width}
                  height={item.rect.depth}
                />
                <text
                  x={item.rect.x + item.rect.width / 2}
                  y={item.rect.y + item.rect.depth / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {item.name}
                </text>
              </g>
            ),
          )}

          {editing &&
            tool === 'select' &&
            draft.length >= 3 &&
            draft.map((point, index) => {
              const next = draft[(index + 1) % draft.length];

              if (!next) {
                return null;
              }

              const center = midpoint(point, next);
              return (
                <circle
                  key={`midpoint-${index}`}
                  cx={center.x}
                  cy={center.y}
                  r={Math.max(18, view.width / 240)}
                  className="spatial-midpoint"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    insertMidpoint(index);
                  }}
                />
              );
            })}

          {editing &&
            draft.map((point, index) => (
              <g key={`vertex-${index}`} className="spatial-vertex-group">
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={Math.max(30, view.width / 160)}
                  className={
                    selectedVertex === index ? 'spatial-vertex is-selected' : 'spatial-vertex'
                  }
                  onPointerDown={(event) => vertexPointerDown(index, event)}
                />
                <text
                  x={point.x}
                  y={point.y - Math.max(55, view.width / 90)}
                  textAnchor="middle"
                  className="spatial-vertex-label"
                >
                  {index + 1}
                </text>
              </g>
            ))}
        </svg>

        {editing && (
          <div className="spatial-edit-state" role="status">
            <div>
              <StatusBadge tone={validDraft ? 'warning' : 'danger'}>
                {validDraft ? 'DRAFT VALID' : 'DRAFT INVALID'}
              </StatusBadge>
              <span>
                {tool === 'draw'
                  ? 'Click canvas to add vertices · click vertex 1 or Close shape when finished.'
                  : 'Drag vertices · click midpoint handles to insert a new vertex.'}
              </span>
            </div>
            <div className="spatial-edit-state-actions">
              <button type="button" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy || !validDraft || !dirty}>
                {busy ? 'Saving…' : 'Save boundary'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="spatial-authoring-error">{error}</div>}
      </div>

      <footer className="spatial-authoring-legend">
        <StatusBadge tone="accent">{displayed.length} VERTICES</StatusBadge>
        <StatusBadge>{areaSqm.toFixed(2)} m²</StatusBadge>
        {gridSizeMm && <StatusBadge>{gridSizeMm} mm GRID</StatusBadge>}
        <span>
          {editing
            ? 'Geometry draft is local until Save boundary.'
            : canWrite
              ? 'Select infrastructure or enter Edit boundary.'
              : 'Read-only spatial view.'}
        </span>
      </footer>

      {selected && <EntityInspector entity={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
