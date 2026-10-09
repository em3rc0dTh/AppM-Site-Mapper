'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BlueprintCanvas } from './blueprint-canvas';
import { PolygonEditor } from '@/components/spatial/polygon-editor';
import {
  findNextRackPlacement,
  explainRackPlacementFailure,
  validateLayoutDraft,
  type LayoutDraft,
} from '@/modules/spatial/domain/layout-draft';
import { gridCoordinateToPoint, pointToGridCoordinate } from '@/modules/spatial/domain/grid';
import {
  polygonInsidePolygon,
  polygonsOverlapArea,
  type PointMm,
} from '@/modules/spatial/domain/geometry';

type BoundaryEdit =
  | { kind: 'room' }
  | {
      kind: 'bay';
      id: string;
      name: string;
      polygon: PointMm[];
      variant: 'BAY' | 'CONTAINER_CLUSTER';
    };
type Placement =
  { kind: 'position'; name: string; clusterId: string } | { kind: 'move'; id: string };

export function RoomLayoutEditor({
  roomId,
  initial,
  canWrite,
  focusRackId,
  focusBayId,
  focusPositionId,
}: {
  roomId: string;
  initial: LayoutDraft;
  canWrite: boolean;
  focusRackId?: string | undefined;
  focusBayId?: string | undefined;
  focusPositionId?: string | undefined;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [past, setPast] = useState<LayoutDraft[]>([]);
  const [future, setFuture] = useState<LayoutDraft[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(focusRackId ?? focusPositionId ?? focusBayId ?? '');
  const [boundary, setBoundary] = useState<BoundaryEdit | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const validation = useMemo(() => validateLayoutDraft(draft), [draft]);
  function change(next: LayoutDraft) {
    setPast((history) => [...history, draft].slice(-100));
    setFuture([]);
    setDraft(next);
    setError('');
  }
  function validChange(next: LayoutDraft) {
    const issue = validateLayoutDraft(next);
    if (issue) {
      setError(issue);
      return false;
    }
    change(next);
    return true;
  }
  const layout = useMemo(
    () => ({
      racks: draft.racks.flatMap((rack) => {
        const p = draft.positions.find((p) => p.id === rack.positionId);
        if (!p) return [];
        try {
          return [
            {
              id: rack.id,
              name: rack.name,
              rect: { x: rack.x, y: rack.y, width: rack.width, depth: rack.depth },
            },
          ];
        } catch {
          return [];
        }
      }),
      positions: draft.positions.map((p) => ({
        ...p,
        occupied: draft.racks.some((r) => r.positionId === p.id),
      })),
    }),
    [draft],
  );
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const name = String(f.get('name') ?? '').trim();
    setError('');
    setPlacement(null);
    if (f.get('kind') === 'bay') {
      setBoundary({
        kind: 'bay',
        id: crypto.randomUUID(),
        name,
        polygon: [],
        variant: f.get('variant') === 'CONTAINER_CLUSTER' ? 'CONTAINER_CLUSTER' : 'BAY',
      });
    } else if (f.get('kind') === 'position') {
      setPlacement({ kind: 'position', name, clusterId: String(f.get('clusterId')) });
    } else {
      const clusterId = String(f.get('clusterId'));
      const width = Number(f.get('width'));
      const depth = Number(f.get('depth'));
      const totalU = Number(f.get('totalU'));
      const placementResult = findNextRackPlacement(draft, clusterId, width, depth);

      if (!placementResult) {
        const reason = explainRackPlacementFailure(draft, clusterId, width, depth);
        const messages = {
          INVALID_CLUSTER: 'Select an existing Bay with a valid boundary.',
          INVALID_DIMENSIONS: 'Rack width and depth must be positive finite dimensions.',
          NEGATIVE_POSITION_REFERENCE:
            'Bay frontage uses negative coordinates. Rack Positions begin at X = 0 and Y = 0 (A-1). Move the Bay frontage onto the canonical positive grid.',
          BAY_FRONTAGE_TOO_NARROW:
            'Bay frontage is too narrow or has no continuous space for this rack width.',
          RACK_OUTSIDE_ROOM: 'Rack depth would extend outside the Room boundary.',
          RACK_DEPTH_BLOCKED_BY_BAY: 'Another Bay blocks the proposed rack footprint.',
          RACK_COLLISION: 'The proposed rack would overlap an existing rack.',
          NO_VALID_GRID_ANCHOR:
            'No valid grid anchor is available. Check the Bay top edge and existing positions.',
        } satisfies Record<ReturnType<typeof explainRackPlacementFailure>, string>;
        setError(`RACK AUTO-PLACEMENT BLOCKED [${reason}]: ${messages[reason]}`);
        return;
      }

      const { point, coordinate } = placementResult;
      const existing = draft.positions.find(
        (position) =>
          position.row === coordinate.row &&
          position.column === coordinate.column &&
          position.clusterId === clusterId &&
          !draft.racks.some((rack) => rack.positionId === position.id),
      );
      const position = existing ?? {
        id: crypto.randomUUID(),
        name: `${name} anchor`,
        clusterId,
        ...coordinate,
      };
      const rackId = crypto.randomUUID();
      const next: LayoutDraft = {
        ...draft,
        positions: existing ? draft.positions : [...draft.positions, position],
        racks: [
          ...draft.racks,
          {
            id: rackId,
            name,
            positionId: position.id,
            x: point.x,
            y: point.y,
            width,
            depth,
            totalU,
          },
        ],
      };

      if (validChange(next)) setSelected(rackId);
    }
  }
  function place(point: PointMm) {
    if (!placement || busy) return;
    const coordinate = pointToGridCoordinate(point);
    if (!coordinate) {
      setError('Choose a supported grid cell inside the room and bay.');
      return;
    }
    if (placement.kind === 'move') {
      if (
        validChange({
          ...draft,
          positions: draft.positions.map((p) =>
            p.id === placement.id ? { ...p, ...coordinate } : p,
          ),
        })
      )
        setPlacement(null);
      return;
    }
    const existing = draft.positions.find(
      (position) => position.row === coordinate.row && position.column === coordinate.column,
    );
    if (existing) {
      setError('This cell already belongs to a position or rack.');
      return;
    }
    const position = existing ?? {
      id: crypto.randomUUID(),
      name: placement.name,
      clusterId: placement.clusterId,
      ...coordinate,
    };
    const next: LayoutDraft = {
      ...draft,
      positions: existing ? draft.positions : [...draft.positions, position],
    };
    if (validChange(next)) {
      setSelected(position.id);
      setPlacement(null);
    }
  }
  function remove() {
    if (draft.clusters.some((c) => c.id === selected)) {
      if (draft.positions.some((p) => p.clusterId === selected)) {
        setError('Remove positions before archiving the bay.');
        return;
      }
      change({ ...draft, clusters: draft.clusters.filter((c) => c.id !== selected) });
    } else if (draft.positions.some((p) => p.id === selected)) {
      if (draft.racks.some((r) => r.positionId === selected)) {
        setError('Remove the rack placement before its position.');
        return;
      }
      change({ ...draft, positions: draft.positions.filter((p) => p.id !== selected) });
    } else change({ ...draft, racks: draft.racks.filter((r) => r.id !== selected) });
    setSelected('');
  }
  async function save() {
    if (validation || boundary || placement) {
      setError(validation ?? 'Finish the canvas operation first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/spatial/rooms/${roomId}/layout`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; draft: LayoutDraft };
      if (!response.ok) throw new Error(result.error ?? 'Save failed');
      setDraft(result.draft);
      setSaved(result.draft);
      setPast([]);
      setFuture([]);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }
  function applyBoundary(polygon: PointMm[]) {
    if (!boundary) return;
    if (boundary.kind === 'room') {
      change({ ...draft, polygon });
    } else {
      const updated = { id: boundary.id, name: boundary.name, polygon, variant: boundary.variant };
      change({
        ...draft,
        clusters: draft.clusters.some((c) => c.id === boundary.id)
          ? draft.clusters.map((c) => (c.id === boundary.id ? updated : c))
          : [...draft.clusters, updated],
      });
      setSelected(boundary.id);
    }
    setBoundary(null);
  }
  const bay = draft.clusters.find((c) => c.id === selected);
  const rack = draft.racks.find((r) => r.id === selected);
  const position = draft.positions.find((p) => p.id === (rack?.positionId ?? selected));
  const selectBay = (
    <label>
      Bay / Cluster
      <select name="clusterId" required defaultValue="">
        <option value="">Select a bay</option>
        {draft.clusters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="mk-room-editor">
      <header className="mk-draft-toolbar">
        <strong>{editing ? 'EDIT · UNSAVED DRAFT' : 'EXPLORE'}</strong>
        {canWrite && !editing && <button onClick={() => setEditing(true)}>EDIT ROOM</button>}
        {editing && (
          <>
            <button
              disabled={busy || !!boundary || !!placement || !past.length}
              onClick={() => {
                const prev = past.at(-1);
                if (prev) {
                  setFuture((f) => [draft, ...f]);
                  setDraft(prev);
                  setPast((p) => p.slice(0, -1));
                }
              }}
            >
              Undo
            </button>
            <button
              disabled={busy || !!boundary || !!placement || !future.length}
              onClick={() => {
                const next = future[0];
                if (next) {
                  setPast((p) => [...p, draft]);
                  setDraft(next);
                  setFuture((f) => f.slice(1));
                }
              }}
            >
              Redo
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDraft(saved);
                setPast([]);
                setFuture([]);
                setEditing(false);
                setBoundary(null);
                setPlacement(null);
                setError('');
              }}
            >
              Cancel
            </button>
            <button
              disabled={busy || !!validation || !!boundary || !!placement}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'SAVE LAYOUT'}
            </button>
          </>
        )}
      </header>
      <div className={`mk-draft-workbench ${editing ? 'is-editing' : ''}`}>
        <div className="spatial-room-stage">
          {boundary ? (
            <PolygonEditor
              key={boundary.kind === 'room' ? 'room' : boundary.id}
              title={
                boundary.kind === 'room'
                  ? 'EDIT ROOM BOUNDARY'
                  : `DRAW / EDIT BAY · ${boundary.name}`
              }
              initial={boundary.kind === 'room' ? draft.polygon : boundary.polygon}
              context={boundary.kind === 'bay' ? draft.polygon : []}
              contextOverlays={draft.clusters
                .filter((cluster) => boundary.kind === 'room' || cluster.id !== boundary.id)
                .map((cluster) => ({
                  id: cluster.id,
                  label: cluster.name,
                  polygon: cluster.polygon,
                }))}
              validate={(polygon) => {
                if (boundary.kind !== 'bay') return null;
                if (!polygonInsidePolygon(polygon, draft.polygon))
                  return 'The complete bay boundary must stay inside the room.';
                if (
                  draft.clusters.some(
                    (cluster) =>
                      cluster.id !== boundary.id && polygonsOverlapArea(polygon, cluster.polygon),
                  )
                )
                  return 'Bay / Cluster boundary must not overlap an existing Bay / Cluster.';
                return null;
              }}
              onConfirm={applyBoundary}
              onCancel={() => setBoundary(null)}
              confirmLabel="Apply to draft"
            />
          ) : draft.polygon.length >= 3 ? (
            <BlueprintCanvas
              polygon={draft.polygon}
              clusters={draft.clusters}
              racks={layout.racks}
              slots={[]}
              positions={layout.positions}
              onSelectPosition={editing && !busy ? setSelected : undefined}
              onSelectRack={editing && !busy ? setSelected : undefined}
              onSelectBay={editing && !busy ? setSelected : undefined}
              onPlace={editing && placement && !busy ? place : undefined}
              focusRackId={
                focusRackId ?? draft.racks.find((r) => r.positionId === focusPositionId)?.id
              }
              focusBayId={
                focusBayId ?? draft.positions.find((p) => p.id === focusPositionId)?.clusterId
              }
              focusPositionId={focusPositionId}
            />
          ) : (
            <div className="mk-empty-boundary">Draw the room boundary to begin.</div>
          )}
        </div>
        {editing && (
          <aside className="mk-draft-inspector">
            <fieldset disabled={busy || !!boundary}>
              <h3>ROOM GEOMETRY</h3>
              <button
                type="button"
                onClick={() => {
                  setPlacement(null);
                  setBoundary({ kind: 'room' });
                }}
              >
                {draft.polygon.length ? 'EDIT ROOM BOUNDARY' : 'DRAW ROOM BOUNDARY'}
              </button>
              <p>
                Draw and edit on the canvas. Apply updates the draft; SAVE LAYOUT persists all
                changes.
              </p>
              {placement && (
                <div className="spatial-placement-prompt" role="status">
                  <strong>
                    Click the canvas to{' '}
                    {placement.kind === 'move'
                      ? 'move the selected anchor'
                      : `place ${placement.name}`}
                    .
                  </strong>
                  <button
                    type="button"
                    onClick={() => {
                      setPlacement(null);
                      setError('');
                    }}
                  >
                    Cancel placement
                  </button>
                </div>
              )}
              <details>
                <summary>+ Draw Bay / Cluster</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="bay" />
                  <label>
                    Name
                    <input name="name" required maxLength={120} />
                  </label>
                  <label>
                    Type
                    <select name="variant">
                      <option value="BAY">Bay</option>
                      <option value="CONTAINER_CLUSTER">Cluster</option>
                    </select>
                  </label>
                  <button disabled={draft.polygon.length < 3}>Draw boundary</button>
                </form>
              </details>
              <details>
                <summary>+ Place Rack</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="rack" />
                  <label>
                    Name
                    <input name="name" required maxLength={120} />
                  </label>
                  {selectBay}
                  <label>
                    Footprint width (mm)
                    <input
                      name="width"
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      defaultValue="600"
                      required
                    />
                  </label>
                  <label>
                    Footprint depth (mm)
                    <input
                      name="depth"
                      type="number"
                      min="1"
                      max="10000"
                      step="1"
                      defaultValue="600"
                      required
                    />
                  </label>
                  <label>
                    Capacity (U)
                    <input
                      name="totalU"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      defaultValue="42"
                      required
                    />
                  </label>
                  <button>Add rack left-to-right</button>
                </form>
              </details>
              <details>
                <summary>+ Place Empty Position</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="position" />
                  <label>
                    Name
                    <input name="name" required maxLength={120} />
                  </label>
                  {selectBay}
                  <button>Choose cell on canvas</button>
                </form>
              </details>
              <h3>SELECT / EDIT</h3>
              <select
                aria-label="Selected layout object"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Select an object</option>
                {[...draft.clusters, ...draft.positions, ...draft.racks].map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
              {bay && (
                <button
                  type="button"
                  onClick={() => {
                    setPlacement(null);
                    setBoundary({ kind: 'bay', ...bay, variant: bay.variant ?? 'BAY' });
                  }}
                >
                  EDIT BAY BOUNDARY
                </button>
              )}
              {position && !rack && (
                <>
                  <p>
                    Anchor: {position.row}-{position.column}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPlacement({ kind: 'move', id: position.id })}
                  >
                    Move anchor on canvas
                  </button>
                </>
              )}
              {rack && position && (
                <p>
                  Placement: automatic left-to-right · X {rack.x}–{rack.x + rack.width} mm · Y{' '}
                  {rack.y} mm · grid ref {position.row}-{position.column}
                </p>
              )}
              {rack && (
                <form
                  key={rack.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    validChange({
                      ...draft,
                      racks: draft.racks.map((r) =>
                        r.id === rack.id
                          ? {
                              ...r,
                              name: String(f.get('name')).trim(),
                              width: Number(f.get('width')),
                              depth: Number(f.get('depth')),
                            }
                          : r,
                      ),
                    });
                  }}
                >
                  <label>
                    Name
                    <input name="name" defaultValue={rack.name} required maxLength={120} />
                  </label>
                  <label>
                    Width (mm)
                    <input
                      name="width"
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={rack.width}
                      required
                    />
                  </label>
                  <label>
                    Depth (mm)
                    <input
                      name="depth"
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={rack.depth}
                      required
                    />
                  </label>
                  <p>{rack.totalU} U · capacity changes require a separate CAS migration.</p>
                  <button>Apply rack properties</button>
                </form>
              )}
              <button type="button" disabled={!selected || !!placement} onClick={remove}>
                Remove selected from layout
              </button>
              <p>
                On Save, persisted empty objects are archived. Racks containing inventory or
                reserved capacity cannot be removed.
              </p>
            </fieldset>
          </aside>
        )}
      </div>
      {editing && validation && (
        <p className="mk-draft-feedback" role="status">
          Layout requires correction: {validation}
        </p>
      )}
      {error && (
        <p className="mk-draft-feedback" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
