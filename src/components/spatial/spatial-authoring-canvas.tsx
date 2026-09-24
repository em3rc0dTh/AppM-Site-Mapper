'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  isValidPolygon,
  polygonArea,
  polygonContainedByPolygon,
  polygonBounds,
  polygonCentroid,
  type PointMm,
  type RectMm,
} from '@/modules/spatial/domain/geometry';
import { EntityInspector, type InspectorEntity } from '@/shared/ui/entity-inspector';
import { StatusBadge } from '@/shared/ui/primitives';
import { openPhysicalPopup } from '@/shared/ui/physical-popup';

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
  readonly kind: 'rack' | 'slot' | 'bay' | 'position';
  readonly rect: RectMm;
  readonly detail?: string;
  readonly href?: string;
  readonly popupHref?: string;
}

export interface SpatialNavigationItem {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly href: string;
}

interface ViewState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type Tool = 'select' | 'pan' | 'draw' | 'measure';

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

function segmentLength(left: PointMm, right: PointMm): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function polygonPerimeter(points: readonly PointMm[]): number {
  if (points.length < 2) {
    return 0;
  }

  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return next ? total + segmentLength(point, next) : total;
  }, 0);
}

function formatDistance(millimetres: number): string {
  return millimetres >= 1000
    ? `${(millimetres / 1000).toFixed(millimetres >= 10_000 ? 1 : 2)} m`
    : `${Math.round(millimetres)} mm`;
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
  navigationItems = [],
  containmentPolygon,
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
  navigationItems?: readonly SpatialNavigationItem[];
  containmentPolygon?: readonly PointMm[] | undefined;
  title?: string;
  subtitle?: string;
}>) {
  const router = useRouter();
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
  const [physical, setPhysical] = useState<InspectorEntity | null>(null);
  const [physicalId, setPhysicalId] = useState<string | null>(null);
  const [past, setPast] = useState<PointMm[][]>([]);
  const [future, setFuture] = useState<PointMm[][]>([]);
  const [measure, setMeasure] = useState<PointMm[]>([]);
  const [cursor, setCursor] = useState<PointMm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointer = useRef<PointerSession | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const displayed = editing ? draft : sourcePolygon;
  const validDraft = draft.length >= 3 && isValidPolygon(draft);
  const dirty = editing && !samePolygon(draft, sourcePolygon);
  const containedDraft =
    !containmentPolygon ||
    containmentPolygon.length < 3 ||
    !validDraft ||
    polygonContainedByPolygon(draft, containmentPolygon);
  const areaSqm = displayed.length >= 3 ? polygonArea(displayed) / 1_000_000 : 0;
  const perimeterMm = displayed.length >= 3 ? polygonPerimeter(displayed) : 0;
  const displayedBounds = displayed.length >= 3 ? polygonBounds(displayed) : null;

  const view: ViewState = {
    width: base.width / zoom,
    height: base.height / zoom,
    x: base.x + (base.width - base.width / zoom) / 2 + pan.x,
    y: base.y + (base.height - base.height / zoom) / 2 + pan.y,
  };

  const contextLabelSize = Math.max(72, view.width / 48);
  const overlayLabelSize = Math.max(62, view.width / 62);
  const coordinateLabelSize = Math.max(54, view.width / 78);
  const vertexLabelSize = Math.max(48, view.width / 86);

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
    const svg = svgRef.current;
    if (!svg) return;
    const zoomWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => Math.min(8, Math.max(0.35, current * (event.deltaY > 0 ? 0.9 : 1.1))));
    };
    svg.addEventListener('wheel', zoomWheel, { passive: false });
    return () => svg.removeEventListener('wheel', zoomWheel);
  }, []);

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
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea, select') || event.target.isContentEditable)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }

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
        return;
      }

      if (
        selectedVertex !== null &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      ) {
        event.preventDefault();
        const selectedPoint = draft[selectedVertex];
        if (!selectedPoint) return;

        const increment = snap && gridSizeMm ? gridSizeMm : 100;
        const delta =
          event.key === 'ArrowLeft'
            ? { x: -increment, y: 0 }
            : event.key === 'ArrowRight'
              ? { x: increment, y: 0 }
              : event.key === 'ArrowUp'
                ? { x: 0, y: -increment }
                : { x: 0, y: increment };

        checkpoint();
        setDraft((current) =>
          current.map((point, index) =>
            index === selectedVertex ? { x: point.x + delta.x, y: point.y + delta.y } : point,
          ),
        );
      }
    };

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });

  function checkpoint() {
    setPast((current) => [...current.slice(-99), clonePolygon(draft)]);
    setFuture([]);
  }
  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((current) => [...current, clonePolygon(draft)]);
    setPast((current) => current.slice(0, -1));
    setDraft(clonePolygon(previous));
    setSelectedVertex(null);
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setPast((current) => [...current, clonePolygon(draft)]);
    setFuture((current) => current.slice(0, -1));
    setDraft(clonePolygon(next));
    setSelectedVertex(null);
  }
  function selectContext(context: SpatialContextPolygon) {
    if (editing || tool !== 'select') return;
    setPhysicalId(context.id);
    setPhysical({
      name: context.name,
      kind: context.kind,
      sections: [
        {
          title: 'Physical boundary',
          fields: [
            { label: 'Area', value: `${(polygonArea(context.polygon) / 1_000_000).toFixed(2)} m²` },
            { label: 'Perimeter', value: formatDistance(polygonPerimeter(context.polygon)) },
          ],
        },
      ],
      ...(context.href ? { actions: [{ label: 'Open physical view →', href: context.href }] } : {}),
    });
  }
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
    setPast([]);
    setFuture([]);
    setMeasure([]);
    setPhysical(null);
    setPhysicalId(null);
    setDraft(clonePolygon(sourcePolygon));
    setEditing(true);
    setError(null);
    setSelected(null);
    setSelectedVertex(null);
    setTool(sourcePolygon.length >= 3 ? 'select' : 'draw');
  }

  function redraw() {
    checkpoint();
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

    checkpoint();
    setDraft((current) => current.filter((_, index) => index !== selectedVertex));
    setSelectedVertex(null);
  }

  function insertMidpoint(index: number) {
    if (draft.length >= 256) {
      setError('Maximum 256 vertices.');
      return;
    }
    const current = draft[index];
    const next = draft[(index + 1) % draft.length];

    if (!current || !next) {
      return;
    }

    const inserted = normalizePoint(midpoint(current, next));
    if ([current, next].some((point) => point.x === inserted.x && point.y === inserted.y)) {
      setError(
        'Snapping merges this midpoint with an existing vertex. Turn Snap off to insert it.',
      );
      return;
    }
    checkpoint();
    setDraft((points) => [...points.slice(0, index + 1), inserted, ...points.slice(index + 1)]);
    setSelectedVertex(index + 1);
  }

  function inspectRectangle(item: SpatialRectOverlay) {
    if (editing || tool !== 'select') {
      return;
    }

    setPhysicalId(item.id);
    setPhysical({
      name: item.name,
      kind: item.kind.toUpperCase(),
      sections: [
        {
          title: 'Physical',
          fields: [
            { label: 'Context', value: item.detail ?? item.kind },
            { label: 'Footprint', value: `${item.rect.width} × ${item.rect.depth} mm` },
            { label: 'Coordinates', value: `X ${item.rect.x} / Y ${item.rect.y} mm` },
          ],
        },
      ],
      ...((item.popupHref ?? item.href)
        ? {
            actions: [
              {
                label:
                  item.kind === 'rack' && item.popupHref
                    ? 'Open container popup'
                    : item.kind === 'rack'
                      ? 'Open rack elevation'
                      : 'Open physical view',
                href: item.popupHref ?? item.href!,
              },
            ],
          }
        : {}),
    });
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

    if (tool === 'measure') {
      const point = toCanvasPoint(event.clientX, event.clientY);
      if (point) setMeasure((current) => (current.length === 1 ? [...current, point] : [point]));
      return;
    }
    if (!editing || tool !== 'draw') {
      return;
    }

    const point = toCanvasPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    if (draft.length >= 256) {
      setError('Maximum 256 vertices.');
      return;
    }
    checkpoint();
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
    checkpoint();
    pointer.current = { type: 'vertex', index };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = toCanvasPoint(event.clientX, event.clientY);
    if (point) setCursor(point);

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
    if (!containedDraft) {
      setError('Boundary must stay inside its parent physical boundary.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/spatial/boundaries/${entityId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polygon: draft }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? 'BOUNDARY_UPDATE_FAILED');
        return;
      }
      setEditing(false);
      setTool('select');
      setPast([]);
      setFuture([]);
      router.refresh();
    } catch {
      setError('Could not save. Your draft is preserved; retry when connected.');
    } finally {
      setBusy(false);
    }
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

          <button
            type="button"
            aria-pressed={tool === 'measure'}
            onClick={() => {
              setTool('measure');
              setMeasure([]);
            }}
          >
            Measure
          </button>
          {editing && (
            <>
              <button type="button" onClick={undo} disabled={!past.length || busy}>
                Undo
              </button>
              <button type="button" onClick={redo} disabled={!future.length || busy}>
                Redo
              </button>
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
          {cursor && (
            <em>
              X {cursor.x} · Y {cursor.y} mm
            </em>
          )}
        </div>

        <svg
          ref={svgRef}
          className={`spatial-authoring-canvas tool-${tool}`}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          onPointerDown={canvasPointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          onPointerLeave={() => setCursor(null)}
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

          {contextPolygons.map((context) => {
            const center = polygonCentroid(context.polygon);
            const contents = (
              <>
                <polygon
                  points={context.polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                />
                {center && (
                  <>
                    <text
                      className="spatial-context-kind"
                      x={center.x}
                      y={center.y - contextLabelSize * 0.42}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={contextLabelSize * 0.48}
                    >
                      {context.kind.replaceAll('_', ' ')}
                    </text>
                    <text
                      className="spatial-context-name"
                      x={center.x}
                      y={center.y + contextLabelSize * 0.18}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={contextLabelSize}
                    >
                      {context.name}
                    </text>
                    {context.href && !editing && (
                      <text
                        className="spatial-context-enter"
                        role="link"
                        tabIndex={0}
                        aria-label={`Open ${context.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (tool === 'select') router.push(context.href!);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation();
                            router.push(context.href!);
                          }
                        }}
                        x={center.x}
                        y={center.y + contextLabelSize * 0.92}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={contextLabelSize * 0.46}
                      >
                        OPEN →
                      </text>
                    )}
                  </>
                )}
              </>
            );

            return context.href && !editing ? (
              <g
                key={context.id}
                className={`spatial-context-shape is-navigable ${physicalId === context.id ? 'is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Select ${context.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  selectContext(context);
                }}
                onDoubleClick={() => {
                  if (tool === 'select') router.push(context.href!);
                }}
                onKeyDown={(event: ReactKeyboardEvent<SVGGElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    selectContext(context);
                  }
                }}
              >
                {contents}
              </g>
            ) : (
              <g key={context.id} className="spatial-context-shape">
                {contents}
              </g>
            );
          })}

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
                  fontSize={coordinateLabelSize}
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
                  fontSize={coordinateLabelSize}
                >
                  {row.label}
                </text>
              ))}
            </g>
          )}

          {rectangles.map((item) => {
            if (item.kind === 'bay') {
              return (
                <g
                  key={item.id}
                  className={`spatial-bay ${physicalId === item.id ? 'is-selected' : ''}`}
                  aria-label={`Select ${item.name}`}
                  role="button"
                  tabIndex={editing ? -1 : 0}
                  onClick={() => inspectRectangle(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') inspectRectangle(item);
                  }}
                >
                  <rect
                    x={item.rect.x}
                    y={item.rect.y}
                    width={item.rect.width}
                    height={item.rect.depth}
                  />
                  <text
                    x={item.rect.x + 34}
                    y={item.rect.y + overlayLabelSize * 0.9}
                    fontSize={overlayLabelSize * 0.72}
                  >
                    {item.name.toUpperCase()}
                  </text>
                  {item.detail && (
                    <text
                      className="spatial-bay-detail"
                      x={item.rect.x + 34}
                      y={item.rect.y + overlayLabelSize * 1.55}
                      fontSize={overlayLabelSize * 0.44}
                    >
                      {item.detail}
                    </text>
                  )}
                </g>
              );
            }

            if (item.kind === 'slot') {
              return (
                <rect
                  key={item.id}
                  x={item.rect.x}
                  y={item.rect.y}
                  width={item.rect.width}
                  height={item.rect.depth}
                  className="spatial-slot"
                  onClick={() => inspectRectangle(item)}
                  role="button"
                  tabIndex={editing ? -1 : 0}
                  aria-label={`Select tile X ${item.rect.x} Y ${item.rect.y}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') inspectRectangle(item);
                  }}
                />
              );
            }

            if (item.kind === 'position') {
              return (
                <g
                  key={item.id}
                  className={`spatial-position ${physicalId === item.id ? 'is-selected' : ''}`}
                  aria-label={`Select ${item.name}`}
                  role="button"
                  tabIndex={editing ? -1 : 0}
                  onClick={() => inspectRectangle(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') inspectRectangle(item);
                  }}
                >
                  <rect
                    x={item.rect.x}
                    y={item.rect.y}
                    width={item.rect.width}
                    height={item.rect.depth}
                  />
                  <text
                    x={item.rect.x + item.rect.width - 30}
                    y={item.rect.y + 42}
                    textAnchor="end"
                    fontSize={overlayLabelSize * 0.46}
                  >
                    {item.detail ?? item.name}
                  </text>
                </g>
              );
            }

            return (
              <g
                key={item.id}
                className={`spatial-rack ${physicalId === item.id ? 'is-selected' : ''}`}
                aria-label={`Select ${item.name}`}
                role="button"
                tabIndex={editing ? -1 : 0}
                onClick={() => inspectRectangle(item)}
                onDoubleClick={() => {
                  if (!editing && tool === 'select') {
                    if (item.popupHref) {
                      openPhysicalPopup(item.popupHref, 'container', item.id);
                    } else if (item.href) {
                      router.push(item.href);
                    }
                  }
                }}
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
                <rect
                  className="spatial-rack-inner"
                  x={item.rect.x + 28}
                  y={item.rect.y + 28}
                  width={Math.max(0, item.rect.width - 56)}
                  height={Math.max(0, item.rect.depth - 56)}
                />
                <text
                  x={item.rect.x + item.rect.width / 2}
                  y={item.rect.y + item.rect.depth / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={overlayLabelSize}
                >
                  {item.name}
                </text>
              </g>
            );
          })}

          {!editing &&
            rectangles
              .filter((item) => item.kind === 'bay' || item.kind === 'position')
              .map((item) => {
                const label =
                  item.kind === 'bay' ? item.name : (item.detail?.split(' · ')[0] ?? item.name);
                const labelSize = overlayLabelSize * 0.7;
                const x = item.rect.x + 18;
                const y =
                  item.kind === 'bay'
                    ? item.rect.y - labelSize * 1.5
                    : item.rect.y + item.rect.depth - labelSize * 1.1;
                return (
                  <g
                    key={`label-${item.id}`}
                    className={`studio-blueprint-tag ${physicalId === item.id ? 'is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${item.name} label`}
                    onClick={() => inspectRectangle(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') inspectRectangle(item);
                    }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(labelSize * (label.length * 0.65 + 1), labelSize * 3)}
                      height={labelSize * 1.6}
                      rx={8}
                    />
                    <text x={x + labelSize * 0.4} y={y + labelSize * 1.12} fontSize={labelSize}>
                      {label}
                    </text>
                  </g>
                );
              })}

          {editing &&
            tool === 'select' &&
            draft.length >= 3 &&
            draft.map((point, index) => {
              const next = draft[(index + 1) % draft.length];

              if (!next) {
                return null;
              }

              const center = midpoint(point, next);
              const length = segmentLength(point, next);
              return (
                <g key={`midpoint-${index}`} className="spatial-segment-control">
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={Math.max(18, view.width / 240)}
                    className="spatial-midpoint"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      insertMidpoint(index);
                    }}
                  />
                  <text
                    className="spatial-segment-length"
                    x={center.x}
                    y={center.y - Math.max(42, view.width / 120)}
                    textAnchor="middle"
                    fontSize={vertexLabelSize * 0.82}
                  >
                    {formatDistance(length)}
                  </text>
                </g>
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
                  fontSize={vertexLabelSize}
                >
                  V{index + 1}
                </text>
              </g>
            ))}
          {measure.length > 0 && (
            <g className="studio-measure" pointerEvents="none">
              {measure.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={view.width / 180} />
              ))}
              {measure[0] && measure[1] && (
                <>
                  <line x1={measure[0].x} y1={measure[0].y} x2={measure[1].x} y2={measure[1].y} />
                  <text
                    x={(measure[0].x + measure[1].x) / 2}
                    y={(measure[0].y + measure[1].y) / 2 - view.width / 60}
                    fontSize={contextLabelSize * 0.7}
                    textAnchor="middle"
                  >
                    {formatDistance(segmentLength(measure[0], measure[1]))}
                  </text>
                </>
              )}
            </g>
          )}
        </svg>
        {!editing && physical && (
          <div className="studio-spatial-selection">
            <strong>{physical.name}</strong>
            <span>{physical.kind}</span>
            <button onClick={() => setSelected(physical)}>Inspect</button>
            {physical.actions?.map((action) => (
              <button
                key={action.href}
                onClick={() => {
                  if (action.href.startsWith('/popup/container/')) {
                    openPhysicalPopup(action.href, 'container', physicalId ?? physical.name);
                  } else if (action.href.startsWith('/popup/device/')) {
                    openPhysicalPopup(action.href, 'device', physicalId ?? physical.name);
                  } else {
                    router.push(action.href);
                  }
                }}
              >
                {action.label} →
              </button>
            ))}
            <button
              aria-label="Clear selection"
              onClick={() => {
                setPhysical(null);
                setPhysicalId(null);
              }}
            >
              ×
            </button>
          </div>
        )}

        {!editing && navigationItems.length > 0 && (
          <nav className="spatial-navigation-rail" aria-label="Contained navigation">
            <span>Contained next</span>
            {navigationItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(item.href)}
                aria-label={`Open ${item.name}`}
              >
                <small>{item.kind.replaceAll('_', ' ')}</small>
                <strong>{item.name}</strong>
                <b>→</b>
              </button>
            ))}
          </nav>
        )}

        {editing && (
          <div className="spatial-edit-state" role="status">
            <div>
              <StatusBadge tone={validDraft && containedDraft ? 'warning' : 'danger'}>
                {validDraft ? (containedDraft ? 'DRAFT VALID' : 'OUTSIDE PARENT') : 'DRAFT INVALID'}
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
              <button type="button" onClick={save} disabled={busy || !validDraft || !containedDraft || !dirty}>
                {busy ? 'Saving…' : 'Save boundary'}
              </button>
            </div>
          </div>
        )}

        {error && <div className="spatial-authoring-error">{error}</div>}
      </div>

      <footer className="spatial-authoring-legend">
        {(displayed.length > 0 || editing) && (
          <StatusBadge tone="accent">{displayed.length} VERTICES</StatusBadge>
        )}
        {displayed.length >= 3 && <StatusBadge>{areaSqm.toFixed(2)} m²</StatusBadge>}
        {displayed.length >= 3 && (
          <StatusBadge>{formatDistance(perimeterMm)} PERIMETER</StatusBadge>
        )}
        {displayedBounds && (
          <StatusBadge>
            {formatDistance(displayedBounds.width)} × {formatDistance(displayedBounds.height)} SPAN
          </StatusBadge>
        )}
        {selectedVertex !== null && draft[selectedVertex] && editing && (
          <StatusBadge>
            V{selectedVertex + 1} · X {draft[selectedVertex].x} · Y {draft[selectedVertex].y}
          </StatusBadge>
        )}
        {editing && selectedVertex !== null && (
          <span className="spatial-keyboard-hint">
            Arrow keys nudge {snap && gridSizeMm ? gridSizeMm + ' mm' : '100 mm'}
          </span>
        )}
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
