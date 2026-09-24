'use client';

import { useMemo, useRef, useState, type PointerEvent } from 'react';

import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import type {
  PositionPlacementView,
  RackPlacementView,
} from '@/modules/spatial/application/spatial-service';
import {
  gridCoordinateToPoint,
  linearGridRun,
  pointToGridCoordinate,
  rowFromIndex,
  rowToIndex,
  TILE_SIZE_MM,
} from '@/modules/spatial/domain/grid';
import { polygonBounds, rectInsidePolygon, type PointMm } from '@/modules/spatial/domain/geometry';
import type { ClusterRun, GridCoordinate } from '@/modules/topology/domain/entities';

function keyOf(coordinate: GridCoordinate): string {
  return `${coordinate.row.toUpperCase()}-${coordinate.column}`;
}

function normalizeEnd(start: GridCoordinate, raw: GridCoordinate): GridCoordinate {
  if (start.row === raw.row || start.column === raw.column) {
    return raw;
  }

  const rowDelta = Math.abs(rowToIndex(raw.row) - rowToIndex(start.row));
  const columnDelta = Math.abs(raw.column - start.column);

  return columnDelta >= rowDelta
    ? { row: start.row, column: raw.column }
    : { row: raw.row, column: start.column };
}

function errorMessage(error: string): string {
  const known: Readonly<Record<string, string>> = {
    CLUSTER_SLOT_OUTSIDE_ROOM: 'Every 600 × 600 slot must fit completely inside the Room.',
    CLUSTER_SLOT_OCCUPIED: 'One or more slots already belong to another Bay/ContainerCluster.',
    CLUSTER_RUN_OCCUPIED:
      'The run cannot remove a Position that already contains a Rack/Container.',
    INVALID_CLUSTER_RUN: 'Choose a horizontal or vertical run.',
    CLUSTER_RUN_TOO_LONG: 'The run is too long.',
    ROOM_BOUNDARY_REQUIRED: 'Define the Room boundary before placing this cluster.',
  };

  return known[error] ?? error.replaceAll('_', ' ');
}

export function ClusterRunAuthoring({
  clusterId,
  clusterName,
  roomName,
  roomPolygon,
  run,
  positions,
  racks,
  blockedPositions,
  canWrite,
}: Readonly<{
  clusterId: string;
  clusterName: string;
  roomName: string;
  roomPolygon: readonly PointMm[];
  run?: ClusterRun | undefined;
  positions: readonly PositionPlacementView[];
  racks: readonly RackPlacementView[];
  blockedPositions: readonly PositionPlacementView[];
  canWrite: boolean;
}>) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bounds = useMemo(() => polygonBounds(roomPolygon), [roomPolygon]);
  const padding = TILE_SIZE_MM;
  const view = bounds
    ? {
        x: bounds.minX - padding,
        y: bounds.minY - padding,
        width: Math.max(bounds.width + padding * 2, TILE_SIZE_MM * 4),
        height: Math.max(bounds.height + padding * 2, TILE_SIZE_MM * 4),
      }
    : { x: -TILE_SIZE_MM, y: -TILE_SIZE_MM, width: 7200, height: 4800 };

  const [editing, setEditing] = useState(canWrite && !run);
  const [start, setStart] = useState<GridCoordinate | null>(run?.start ?? null);
  const [end, setEnd] = useState<GridCoordinate | null>(run?.end ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);

  const selectedPosition = positions.find((position) => position.id === selectedPositionId) ?? null;

  const preview = useMemo(() => {
    if (!start || !end) return [];

    try {
      return linearGridRun(start, end);
    } catch {
      return [];
    }
  }, [end, start]);

  const blockedKeys = new Set(blockedPositions.map((position) => position.coordinate));

  const gridBounds = bounds
    ? {
        minColumn: Math.max(1, Math.floor(bounds.minX / TILE_SIZE_MM) + 1),
        maxColumn: Math.max(1, Math.ceil(bounds.maxX / TILE_SIZE_MM)),
        minRow: Math.max(0, Math.floor(bounds.minY / TILE_SIZE_MM)),
        maxRow: Math.max(0, Math.ceil(bounds.maxY / TILE_SIZE_MM) - 1),
      }
    : { minColumn: 1, maxColumn: 12, minRow: 0, maxRow: 7 };

  function eventCoordinate(event: PointerEvent<SVGSVGElement>): GridCoordinate | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());

    try {
      const coordinate = pointToGridCoordinate({ x: transformed.x, y: transformed.y });
      const topLeft = gridCoordinateToPoint(coordinate);
      const inside = rectInsidePolygon(
        {
          x: topLeft.x,
          y: topLeft.y,
          width: TILE_SIZE_MM,
          depth: TILE_SIZE_MM,
        },
        roomPolygon,
      );
      return inside ? coordinate : null;
    } catch {
      return null;
    }
  }

  function choose(event: PointerEvent<SVGSVGElement>) {
    if (!editing || busy) return;

    const coordinate = eventCoordinate(event);
    if (!coordinate) {
      setError('Choose a complete 600 × 600 slot inside the Room boundary.');
      return;
    }

    setError(null);

    if (!start || (start && end)) {
      setStart(coordinate);
      setEnd(null);
      return;
    }

    setEnd(normalizeEnd(start, coordinate));
  }

  function beginEdit() {
    setSelectedPositionId(null);
    setEditing(true);
    setStart(run?.start ?? null);
    setEnd(run?.end ?? null);
    setError(null);
  }

  function cancel() {
    setEditing(false);
    setStart(run?.start ?? null);
    setEnd(run?.end ?? null);
    setError(null);
  }

  async function save() {
    if (!start || !end || preview.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/spatial/clusters/${clusterId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start, end }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(errorMessage(result.error ?? 'CLUSTER_RUN_UPDATE_FAILED'));
        return;
      }

      window.location.reload();
    } catch {
      setError('Could not save the cluster run. Retry when connected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cluster-run-authoring">
      <header className="cluster-run-toolbar">
        <div>
          <strong>ContainerCluster / Bay run</strong>
          <span>
            {roomName} · 600 × 600 mm slots · {run ? run.orientation : 'UNPLACED'}
          </span>
        </div>
        <div>
          {!editing && canWrite && (
            <button type="button" onClick={beginEdit}>
              Edit run
            </button>
          )}
          {editing && (
            <>
              <button type="button" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !start || !end || preview.length === 0}
              >
                {busy ? 'Saving…' : 'Save run'}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="cluster-run-canvas">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={choose}
          aria-label={`Physical run for ${clusterName}`}
        >
          <defs>
            <pattern
              id={`cluster-grid-${clusterId}`}
              width={TILE_SIZE_MM}
              height={TILE_SIZE_MM}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${TILE_SIZE_MM} 0 L 0 0 0 ${TILE_SIZE_MM}`}
                className="cluster-grid-line"
              />
            </pattern>
          </defs>

          <polygon
            className="cluster-room-boundary"
            points={roomPolygon.map((point) => `${point.x},${point.y}`).join(' ')}
          />
          <rect
            x={view.x}
            y={view.y}
            width={view.width}
            height={view.height}
            fill={`url(#cluster-grid-${clusterId})`}
            pointerEvents="none"
          />

          {Array.from(
            { length: gridBounds.maxColumn - gridBounds.minColumn + 1 },
            (_, index) => gridBounds.minColumn + index,
          ).map((column) => (
            <text
              key={`column-${column}`}
              x={(column - 0.5) * TILE_SIZE_MM}
              y={bounds ? bounds.minY - TILE_SIZE_MM * 0.18 : -120}
              className="cluster-grid-label"
              textAnchor="middle"
            >
              {column}
            </text>
          ))}

          {Array.from(
            { length: gridBounds.maxRow - gridBounds.minRow + 1 },
            (_, index) => gridBounds.minRow + index,
          ).map((rowIndex) => (
            <text
              key={`row-${rowIndex}`}
              x={bounds ? bounds.minX - TILE_SIZE_MM * 0.18 : -120}
              y={(rowIndex + 0.58) * TILE_SIZE_MM}
              className="cluster-grid-label"
              textAnchor="end"
            >
              {rowFromIndex(rowIndex)}
            </text>
          ))}

          {blockedPositions.map((position) => (
            <rect
              key={`blocked-${position.id}`}
              className="cluster-slot is-blocked"
              x={position.rect.x}
              y={position.rect.y}
              width={position.rect.width}
              height={position.rect.depth}
            />
          ))}

          {!editing &&
            positions.map((position) => (
              <g
                key={position.id}
                className="cluster-position-hit"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setSelectedPositionId(position.id);
                }}
              >
                <rect
                  className={`cluster-slot is-current ${selectedPositionId === position.id ? 'is-selected' : ''}`}
                  x={position.rect.x}
                  y={position.rect.y}
                  width={position.rect.width}
                  height={position.rect.depth}
                />
                <text
                  x={position.rect.x + position.rect.width / 2}
                  y={position.rect.y + position.rect.depth / 2}
                  className="cluster-slot-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {position.coordinate}
                </text>
              </g>
            ))}

          {!editing &&
            racks.map((rack) => (
              <g
                key={rack.id}
                className={`cluster-rack-footprint ${rack.clusterId === clusterId ? 'is-current-cluster' : 'is-neighbor-cluster'}`}
                pointerEvents="none"
              >
                <rect
                  x={rack.rect.x}
                  y={rack.rect.y}
                  width={rack.rect.width}
                  height={rack.rect.depth}
                />
                <text
                  x={rack.rect.x + rack.rect.width / 2}
                  y={rack.rect.y + rack.rect.depth / 2 - 34}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {rack.name}
                </text>
                <text
                  className="cluster-rack-footprint-detail"
                  x={rack.rect.x + rack.rect.width / 2}
                  y={rack.rect.y + rack.rect.depth / 2 + 48}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {rack.variant} · {rack.dimensionsMm.width} × {rack.dimensionsMm.depth} mm ·{' '}
                  {rack.clusterName}
                </text>
              </g>
            ))}

          {editing &&
            preview.map((coordinate) => {
              const point = gridCoordinateToPoint(coordinate);
              const key = keyOf(coordinate);
              return (
                <g key={key}>
                  <rect
                    className={`cluster-slot is-preview ${blockedKeys.has(key) ? 'is-conflict' : ''}`}
                    x={point.x}
                    y={point.y}
                    width={TILE_SIZE_MM}
                    height={TILE_SIZE_MM}
                  />
                  <text
                    x={point.x + TILE_SIZE_MM / 2}
                    y={point.y + TILE_SIZE_MM / 2}
                    className="cluster-slot-label"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {key}
                  </text>
                </g>
              );
            })}
        </svg>

        {!editing && selectedPosition && (
          <aside className="cluster-slot-placement" aria-label="Selected cluster slot">
            <div className="cluster-slot-placement-heading">
              <div>
                <span>SELECTED SLOT</span>
                <strong>{selectedPosition.coordinate}</strong>
              </div>
              <button type="button" onClick={() => setSelectedPositionId(null)}>
                ×
              </button>
            </div>
            <small>
              {selectedPosition.occupied
                ? selectedPosition.occupancyRole === 'COVERED'
                  ? `COVERED · ${selectedPosition.rack?.name ?? 'Container/Rack'} extends into this 600 × 600 mm Position from another anchor slot.`
                  : `OCCUPIED · ${selectedPosition.rack?.name ?? 'Container/Rack'} is anchored in this 600 × 600 mm Position.`
                : 'AVAILABLE · this is one 600 × 600 mm Position in the cluster run. Choose what physical asset will occupy it.'}
            </small>
            {selectedPosition.occupied ? (
              <div className="cluster-slot-occupied">
                {selectedPosition.rack && (
                  <>
                    <strong>{selectedPosition.rack.name}</strong>
                    <span>
                      {selectedPosition.rack.variant} · {selectedPosition.rack.dimensionsMm.width} ×{' '}
                      {selectedPosition.rack.dimensionsMm.depth} mm
                    </span>
                    <a
                      href={
                        selectedPosition.rack.variant === 'RACK'
                          ? `/rack/${selectedPosition.rack.id}`
                          : `/popup/container/${selectedPosition.rack.id}`
                      }
                    >
                      Open {selectedPosition.rack.variant === 'RACK' ? 'Rack' : 'Container'} →
                    </a>
                  </>
                )}
                <p>Select another available slot to place new infrastructure.</p>
              </div>
            ) : canWrite ? (
              <TopologyCreateForm kind="CONTAINER_RACK" parentId={selectedPosition.id} />
            ) : (
              <p>Your role is read-only.</p>
            )}
          </aside>
        )}

        <div className="cluster-run-state">
          <strong>{clusterName}</strong>
          {editing ? (
            <span>
              {!start
                ? '1. Click the first slot.'
                : !end
                  ? `Start ${keyOf(start)} · 2. Click the end slot. Axis locks horizontal/vertical.`
                  : `${keyOf(start)} → ${keyOf(end)} · ${preview.length} slots · ${start.row === end.row ? 'HORIZONTAL' : 'VERTICAL'}`}
            </span>
          ) : (
            <span>
              {run
                ? `${keyOf(run.start)} → ${keyOf(run.end)} · ${positions.length} slots · ${run.orientation}`
                : 'UNPLACED'}
            </span>
          )}
        </div>
      </div>

      {error && <div className="cluster-run-error">{error}</div>}
    </section>
  );
}
