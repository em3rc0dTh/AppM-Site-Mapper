'use client';

import { useId, useRef, useState, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  isCanonicalPolygon,
  isInPositiveDrawingPlane,
  polygonArea,
  type PointMm,
} from '@/modules/spatial/domain/geometry';
import { snapToGrid } from '@/modules/spatial/domain/grid';

type Snapshot = { points: PointMm[]; closed: boolean };
type View = { x: number; y: number; width: number; height: number };

export interface PolygonContextOverlay {
  readonly id: string;
  readonly label: string;
  readonly polygon: readonly PointMm[];
}

function centroid(points: readonly PointMm[]): PointMm {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}
function fit(points: readonly PointMm[]): View {
  if (!points.length) return { x: 0, y: 0, width: 14400, height: 9600 };
  const minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  const width = Math.max(1200, Math.max(...points.map((p) => p.x)) - minX);
  const height = Math.max(1200, Math.max(...points.map((p) => p.y)) - minY);
  const pad = Math.max(width, height) * 0.12;
  return {
    x: minX < 0 ? minX - pad : Math.max(0, minX - pad),
    y: minY < 0 ? minY - pad : Math.max(0, minY - pad),
    width: width + 2 * pad,
    height: height + 2 * pad,
  };
}
const pointsText = (points: readonly PointMm[]) => points.map((p) => `${p.x},${p.y}`).join(' ');

/** Draft-only editor. Screen CTM inversion includes SVG letterboxing, viewBox, pan and zoom. */
export function PolygonEditor({
  title,
  initial = [],
  context = [],
  contextLabel,
  contextOverlays = [],
  onConfirm,
  onCancel,
  validate,
  busy = false,
  error,
  confirmLabel,
}: {
  title: string;
  initial?: readonly PointMm[];
  context?: readonly PointMm[];
  contextLabel?: string;
  contextOverlays?: readonly PolygonContextOverlay[];
  onConfirm: (polygon: PointMm[]) => void;
  onCancel: () => void;
  validate?: (polygon: readonly PointMm[]) => string | null;
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
}) {
  const t = useTranslations('polygonTools');
  const [draft, setDraft] = useState<Snapshot>(() => ({
    points: [...initial],
    closed: initial.length >= 3,
  }));
  const [past, setPast] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const contextualPoints = contextOverlays.flatMap((overlay) => [...overlay.polygon]);
  const [view, setView] = useState(() => fit([...initial, ...context, ...contextualPoints]));
  const [tool, setTool] = useState<'draw' | 'pan'>('draw');
  const [snap, setSnap] = useState(true);
  const [cursor, setCursor] = useState<PointMm | null>(null);
  const [coordinateError, setCoordinateError] = useState('');
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; before: Snapshot } | null>(null);
  const pan = useRef<{
    clientX: number;
    clientY: number;
    view: View;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const gridId = useId().replaceAll(':', '');
  const invalid = draft.points.some((p) => !isInPositiveDrawingPlane(p))
    ? 'The boundary contains negative coordinates. Move its vertices to X >= 0 and Y >= 0 before saving.'
    : !isCanonicalPolygon(draft.points)
      ? 'Draw a simple, non-zero-area boundary with 3–256 vertices.'
      : (validate?.(draft.points) ?? null);
  function change(next: Snapshot) {
    setPast((history) => [...history, draft].slice(-100));
    setDraft(next);
    setSelected(null);
  }
  function point(event: { clientX: number; clientY: number }, snapped = true): PointMm | null {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const result = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const raw = { x: result.x, y: result.y };
    // Validate the physical pointer BEFORE snapping: -1 mm must not become 0 mm.
    if (!isInPositiveDrawingPlane(raw)) return null;
    return snap && snapped ? snapToGrid(raw) : raw;
  }
  function beginPan(event: PointerEvent<SVGSVGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const inverse = matrix.inverse();
    pan.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      view,
      scaleX: inverse.a,
      scaleY: inverse.d,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (busy || event.button !== 0) return;
    if (tool === 'pan') {
      beginPan(event);
      return;
    }
    if (draft.closed || draft.points.length >= 256) return;
    const next = point(event);
    if (!next) {
      setCoordinateError('OUTSIDE DRAWING GRID: X and Y must be 0 or greater.');
      return;
    }
    setCoordinateError('');
    change({ points: [...draft.points, next], closed: false });
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (busy) return;
    const panning = pan.current;
    if (panning) {
      setView({
        ...panning.view,
        x: panning.view.x - (event.clientX - panning.clientX) * panning.scaleX,
        y: panning.view.y - (event.clientY - panning.clientY) * panning.scaleY,
      });
      return;
    }
    const next = point(event);
    if (!next) {
      setCursor(null);
      return;
    }
    setCursor(next);
    const dragging = drag.current;
    if (dragging)
      setDraft((value) => ({
        ...value,
        points: value.points.map((p, i) => (i === dragging.index ? next : p)),
      }));
  }
  function end(event: PointerEvent<SVGSVGElement>, cancel = false) {
    if (cancel && drag.current) {
      setDraft(drag.current.before);
      setPast((history) => history.slice(0, -1));
    }
    drag.current = null;
    pan.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function zoom(factor: number) {
    setView((v) => {
      const width = Math.max(600, Math.min(2_000_000, v.width * factor));
      const height = (v.height * width) / v.width;
      return { x: v.x + (v.width - width) / 2, y: v.y + (v.height - height) / 2, width, height };
    });
  }
  const radius = Math.max(view.width, view.height) / 130;
  return (
    <section className="spatial-polygon-editor" aria-label={title}>
      <header>
        <div className="spatial-editor-heading">
          <strong>{title}</strong>
          <span>
            {t('vertices', { count: draft.points.length })} ·{' '}
            {draft.closed && !invalid
              ? `${(polygonArea(draft.points) / 1_000_000).toFixed(2)} m²`
              : t('draft')}
          </span>
        </div>
        <div className="spatial-editor-header-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            {t('cancel')}
          </button>
          {draft.closed && (
            <button
              type="button"
              className="spatial-editor-primary-action"
              disabled={busy || !!invalid}
              onClick={() => onConfirm(draft.points.map((point) => ({ ...point })))}
            >
              {busy ? t('applying') : (confirmLabel ?? t('saveBoundary'))}
            </button>
          )}
        </div>
      </header>
      <div className="spatial-editor-tools">
        <button
          type="button"
          disabled={busy}
          aria-pressed={tool === 'draw'}
          onClick={() => setTool('draw')}
        >
          {t('draw')}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={tool === 'pan'}
          onClick={() => setTool('pan')}
        >
          {t('pan')}
        </button>
        <button type="button" disabled={busy} onClick={() => zoom(0.8)} aria-label={t('zoomIn')}>
          +
        </button>
        <button type="button" disabled={busy} onClick={() => zoom(1.25)} aria-label={t('zoomOut')}>
          −
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setView(fit([...draft.points, ...context, ...contextualPoints]))}
        >
          {t('fit')}
        </button>
        <label>
          <input
            type="checkbox"
            checked={snap}
            disabled={busy}
            onChange={(e) => setSnap(e.target.checked)}
          />
          {t('snap')}
        </label>
        <button
          type="button"
          disabled={busy || !past.length}
          onClick={() => {
            const previous = past.at(-1);
            if (previous) {
              setDraft(previous);
              setPast((history) => history.slice(0, -1));
              setSelected(null);
            }
          }}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={busy || !draft.points.length}
          onClick={() => change({ points: [], closed: false })}
        >
          Clear
        </button>
        <button
          type="button"
          disabled={busy || selected === null || (draft.closed && draft.points.length <= 3)}
          onClick={() =>
            change({ ...draft, points: draft.points.filter((_, i) => i !== selected) })
          }
        >
          Remove vertex
        </button>
      </div>
      {(context.length >= 3 || contextOverlays.length > 0) && (
        <div className="spatial-editor-context-legend" aria-label={t('surveyed')}>
          {context.length >= 3 && (
            <span>
              <i className="spatial-editor-context-boundary" aria-hidden="true" />
              {contextLabel ?? t('boundary')} · {t('limit')}
            </span>
          )}
          {contextOverlays.length > 0 && (
            <span>
              <i className="spatial-editor-context-rooms" aria-hidden="true" />
              {t('existingSpaces', { count: contextOverlays.length })}
            </span>
          )}
          <span>{t('newRoom')}</span>
        </div>
      )}
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        className="spatial-drawing-surface"
        role="group"
        aria-label={t('canvas', { title })}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <pattern id={gridId} width="600" height="600" patternUnits="userSpaceOnUse">
            <path
              d="M600 0H0V600"
              fill="none"
              stroke="#dce5ef"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill={`url(#${gridId})`}
        />
        {/* Display uneditable negative plane when panning across the origin. */}
        {view.x < 0 && (
          <rect
            x={view.x}
            y={view.y}
            width={Math.min(view.width, -view.x)}
            height={view.height}
            fill="#df56681c"
            pointerEvents="none"
          />
        )}
        {view.y < 0 && (
          <rect
            x={view.x}
            y={view.y}
            width={view.width}
            height={Math.min(view.height, -view.y)}
            fill="#df56681c"
            pointerEvents="none"
          />
        )}
        {context.length >= 3 && (
          <polygon
            points={pointsText(context)}
            fill="#7c97b313"
            stroke="#3d6c91"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {contextOverlays.map((overlay) => {
          if (overlay.polygon.length < 3) return null;
          const center = centroid(overlay.polygon);
          return (
            <g key={overlay.id} className="spatial-context-overlay" pointerEvents="none">
              <polygon
                points={pointsText(overlay.polygon)}
                fill="#14b8a626"
                stroke="#0f8f83"
                strokeWidth="2"
                strokeDasharray="7 5"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0a5f58"
                fontWeight="700"
                fontSize={Math.max(radius * 1.8, 26)}
                vectorEffect="non-scaling-stroke"
              >
                {overlay.label}
              </text>
            </g>
          );
        })}
        {context.length >= 3 && (
          <text
            x={Math.min(...context.map((p) => p.x))}
            y={Math.min(...context.map((p) => p.y))}
            dy={-Math.max(radius * 1.25, 22)}
            fontSize={Math.max(radius * 1.3, 22)}
            fill="#315a79"
            fontWeight="700"
            pointerEvents="none"
          >
            {contextLabel ?? 'Surveyed boundary'}
          </text>
        )}
        {draft.closed ? (
          <polygon
            points={pointsText(draft.points)}
            fill={invalid ? '#ef444420' : '#2878d420'}
            stroke={invalid ? '#dc3848' : '#2878d4'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : (
          <polyline
            points={pointsText(draft.points)}
            fill="none"
            stroke="#2878d4"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {!draft.closed && draft.points.length > 0 && cursor && (
          <line
            x1={draft.points.at(-1)!.x}
            y1={draft.points.at(-1)!.y}
            x2={cursor.x}
            y2={cursor.y}
            stroke="#2878d4"
            strokeDasharray="6 5"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
        {draft.closed &&
          draft.points.map((a, i) => {
            const b = draft.points[(i + 1) % draft.points.length]!;
            return (
              <line
                key={`edge-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth="14"
                vectorEffect="non-scaling-stroke"
                aria-label={`Add vertex on edge ${i + 1}`}
                onPointerDown={(e) => {
                  if (tool === 'pan') return;
                  e.stopPropagation();
                  if (busy || draft.points.length >= 256) return;
                  const p = point(e, false);
                  if (!p) {
                    setCoordinateError('OUTSIDE DRAWING GRID: X and Y must be 0 or greater.');
                    return;
                  }
                  setCoordinateError('');
                  const dx = b.x - a.x,
                    dy = b.y - a.y,
                    length = dx * dx + dy * dy;
                  if (!length) return;
                  const t = Math.max(
                    0.01,
                    Math.min(0.99, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length),
                  );
                  change({
                    closed: true,
                    points: [
                      ...draft.points.slice(0, i + 1),
                      { x: a.x + t * dx, y: a.y + t * dy },
                      ...draft.points.slice(i + 1),
                    ],
                  });
                  setSelected(i + 1);
                }}
              />
            );
          })}
        {draft.points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={radius}
            fill={i === selected ? '#f4b740' : '#fff'}
            stroke="#2166b5"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            tabIndex={0}
            role="button"
            aria-label={`Vertex ${i + 1}`}
            onFocus={() => setSelected(i)}
            onKeyDown={(e) => {
              if (busy) return;
              if (e.key === 'Delete' && (!draft.closed || draft.points.length > 3)) {
                e.preventDefault();
                change({ ...draft, points: draft.points.filter((_, index) => index !== i) });
              }
            }}
            onPointerDown={(e) => {
              if (tool === 'pan') return;
              e.stopPropagation();
              if (busy) return;
              if (i === 0 && !draft.closed && !invalid) {
                change({ ...draft, closed: true });
                return;
              }
              setSelected(i);
              if (draft.closed) {
                drag.current = { index: i, before: draft };
                setPast((history) => [...history, draft].slice(-100));
                svg.current?.setPointerCapture(e.pointerId);
              }
            }}
          />
        ))}
      </svg>
      <p className="spatial-editor-hint">
        {draft.closed
          ? 'Drag a vertex. Click an edge to add one. Select a vertex to remove it.'
          : 'Draw only at X ≥ 0 and Y ≥ 0 (A-1 origin). Red shading marks an invalid negative plane. Pan does not change physical coordinates.'}
      </p>
      <footer>
        <span role="status">
          {error || coordinateError || (draft.points.length >= 3 ? invalid : null)}
        </span>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        {!draft.closed ? (
          <button
            type="button"
            disabled={busy || !!invalid}
            onClick={() => change({ ...draft, closed: true })}
          >
            Finish boundary
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !!invalid}
            onClick={() => onConfirm(draft.points.map((p) => ({ ...p })))}
          >
            {busy ? t('saving') : (confirmLabel ?? t('saveBoundary'))}
          </button>
        )}
      </footer>
    </section>
  );
}
