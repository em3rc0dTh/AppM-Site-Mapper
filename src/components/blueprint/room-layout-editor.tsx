'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BlueprintCanvas } from './blueprint-canvas';
import { validateLayoutDraft, type LayoutDraft } from '@/modules/spatial/domain/layout-draft';
import { gridCoordinateToPoint } from '@/modules/spatial/domain/grid';
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
  const [selected, setSelected] = useState('');
  function change(next: LayoutDraft) {
    setPast((p) => [...p, draft].slice(-50));
    setFuture([]);
    setDraft(next);
    setError('');
  }
  const layout = useMemo(() => {
    const racks = draft.racks.flatMap((r) => {
      const p = draft.positions.find((p) => p.id === r.positionId);
      if (!p) return [];
      try {
        return [
          {
            id: r.id,
            name: r.name,
            rect: { ...gridCoordinateToPoint(p), width: r.width, depth: r.depth },
          },
        ];
      } catch {
        return [];
      }
    });
    const positions = draft.positions.map((p) => ({
      ...p,
      occupied: draft.racks.some((r) => r.positionId === p.id),
    }));
    return { racks, positions };
  }, [draft]);
  const validation = validateLayoutDraft(draft);
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const kind = String(f.get('kind'));
    const id = crypto.randomUUID();
    const name = String(f.get('name')).trim();
    if (kind === 'cluster') {
      const x = Number(f.get('x')) * 600,
        y = Number(f.get('y')) * 600,
        w = Number(f.get('width')) * 600,
        d = Number(f.get('depth')) * 600;
      change({
        ...draft,
        clusters: [
          ...draft.clusters,
          {
            id,
            name,
            polygon: [
              { x, y },
              { x: x + w, y },
              { x: x + w, y: y + d },
              { x, y: y + d },
            ],
          },
        ],
      });
    } else if (kind === 'position') {
      change({
        ...draft,
        positions: [
          ...draft.positions,
          {
            id,
            name,
            clusterId: String(f.get('clusterId')),
            row: String(f.get('row')).toUpperCase(),
            column: Number(f.get('column')),
          },
        ],
      });
    } else {
      change({
        ...draft,
        racks: [
          ...draft.racks,
          {
            id,
            name,
            positionId: String(f.get('positionId')),
            width: Number(f.get('width')),
            depth: Number(f.get('depth')),
            totalU: Number(f.get('totalU')),
          },
        ],
      });
    }
    setSelected(id);
  }
  function remove() {
    if (draft.clusters.some((c) => c.id === selected)) {
      if (draft.positions.some((p) => p.clusterId === selected)) {
        setError('Remove positions before deleting the cluster.');
        return;
      }
      change({ ...draft, clusters: draft.clusters.filter((c) => c.id !== selected) });
    } else if (draft.positions.some((p) => p.id === selected)) {
      if (draft.racks.some((r) => r.positionId === selected)) {
        setError('Assign or remove the rack before deleting its position.');
        return;
      }
      change({ ...draft, positions: draft.positions.filter((p) => p.id !== selected) });
    } else change({ ...draft, racks: draft.racks.filter((r) => r.id !== selected) });
    setSelected('');
  }
  async function save() {
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
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
  const position = draft.positions.find((p) => p.id === selected);
  const rack = draft.racks.find((r) => r.id === selected);
  const persistedRack = rack ? saved.racks.find((r) => r.id === rack.id) : undefined;
  const persistedPosition = persistedRack
    ? saved.positions.find((p) => p.id === persistedRack.positionId)
    : undefined;
  return (
    <section className="mk-room-editor">
      <header className="mk-draft-toolbar">
        <strong>{editing ? 'EDIT' : 'EXPLORE'}</strong>
        {canWrite && !editing && <button onClick={() => setEditing(true)}>EDIT ROOM</button>}
        {editing && (
          <>
            <button
              disabled={!past.length || busy}
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
              disabled={!future.length || busy}
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
                setError('');
              }}
            >
              Cancel
            </button>
            <button disabled={busy || !!validation} onClick={save}>
              {busy ? 'Saving…' : 'SAVE LAYOUT'}
            </button>
          </>
        )}
      </header>
      <div className={`mk-draft-workbench ${editing ? 'is-editing' : ''}`}>
        <div>
          {draft.polygon.length >= 3 ? (
            <BlueprintCanvas
              polygon={draft.polygon}
              clusters={draft.clusters}
              racks={layout.racks}
              slots={[]}
              positions={layout.positions}
              onSelectPosition={editing ? setSelected : undefined}
              onSelectRack={editing ? setSelected : undefined}
              focusRackId={focusRackId ?? draft.racks.find((rack) => rack.positionId === focusPositionId)?.id}
              focusBayId={focusBayId ?? draft.positions.find((position) => position.id === focusPositionId)?.clusterId}
              focusPositionId={focusPositionId}
            />
          ) : (
            <div className="mk-empty-boundary">Define the surveyed room boundary to begin.</div>
          )}
        </div>
        {editing && (
          <aside className="mk-draft-inspector">
            <fieldset disabled={busy}>
              <h3>ROOM GEOMETRY</h3>
              <label>
                Surveyed polygon · x,y in mm
                <textarea
                  rows={5}
                  defaultValue={draft.polygon.map((p) => `${p.x},${p.y}`).join('\n')}
                  key={saved.version}
                  onBlur={(e) => {
                    const polygon = e.target.value
                      .trim()
                      .split('\n')
                      .map((line) => {
                        const [x, y] = line.split(',').map(Number);
                        return { x: x ?? NaN, y: y ?? NaN };
                      });
                    change({ ...draft, polygon });
                  }}
                />
              </label>
              <details>
                <summary>+ Add Cluster</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="cluster" />
                  <label>
                    Name
                    <input name="name" required maxLength={120} />
                  </label>
                  <div className="mk-input-pair">
                    <label>
                      X tile
                      <input name="x" type="number" min="0" defaultValue="0" required />
                    </label>
                    <label>
                      Y tile
                      <input name="y" type="number" min="0" defaultValue="0" required />
                    </label>
                    <label>
                      Width tiles
                      <input name="width" type="number" min="1" defaultValue="6" required />
                    </label>
                    <label>
                      Depth tiles
                      <input name="depth" type="number" min="1" defaultValue="2" required />
                    </label>
                  </div>
                  <button>Add cluster</button>
                </form>
              </details>
              <details>
                <summary>+ Add Position (rack anchor)</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="position" />
                  <label>
                    Name
                    <input name="name" required maxLength={120} />
                  </label>
                  <label>
                    Cluster
                    <select name="clusterId" required>
                      <option value="">Select</option>
                      {draft.clusters.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mk-input-pair">
                    <label>
                      Row
                      <input name="row" pattern="[A-Za-z]{1,3}" defaultValue="A" required />
                    </label>
                    <label>
                      Column
                      <input name="column" type="number" min="1" defaultValue="1" required />
                    </label>
                  </div>
                  <button>Add position</button>
                </form>
              </details>
              <details>
                <summary>+ Add Rack / Container with footprint</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="rack" />
                  <label>
                    Name
                    <input name="name" required maxLength={120} />
                  </label>
                  <label>
                    Available position
                    <select name="positionId" required>
                      <option value="">Select</option>
                      {draft.positions
                        .filter((p) => !draft.racks.some((r) => r.positionId === p.id))
                        .map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.row}-{p.column}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="mk-input-pair">
                    <label>
                      Footprint width mm (can span multiple 600 mm cells)
                      <input name="width" type="number" min="1" defaultValue="600" required />
                    </label>
                    <label>
                      Footprint depth mm
                      <input name="depth" type="number" min="1" defaultValue="600" required />
                    </label>
                    <label>
                      Capacity U
                      <input
                        name="totalU"
                        type="number"
                        min="1"
                        max="100"
                        defaultValue="42"
                        required
                      />
                    </label>
                  </div>
                  <button>Place rack</button>
                </form>
              </details>
              <h3>SELECT / MOVE / ASSIGN</h3>
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
              {position && (
                <div className="mk-input-pair">
                  <label>
                    Grid row
                    <input
                      value={position.row}
                      onChange={(e) =>
                        change({
                          ...draft,
                          positions: draft.positions.map((p) =>
                            p.id === selected ? { ...p, row: e.target.value.toUpperCase() } : p,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Grid column
                    <input
                      type="number"
                      min="1"
                      value={position.column}
                      onChange={(e) =>
                        change({
                          ...draft,
                          positions: draft.positions.map((p) =>
                            p.id === selected ? { ...p, column: Number(e.target.value) } : p,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              )}
              {rack && (
                <p className="rack-footprint-summary">
                  Footprint: {rack.width} × {rack.depth} mm · covers
                  {' '}{Math.ceil(rack.width / 600)} × {Math.ceil(rack.depth / 600)} grid cells
                  from its anchor. Server validation enforces room/bay boundaries and collisions.
                </p>
              )}
              {rack && (
                <label>
                  Explicitly assign rack to position
                  <select
                    value={rack.positionId}
                    onChange={(e) =>
                      change({
                        ...draft,
                        racks: draft.racks.map((r) =>
                          r.id === selected ? { ...r, positionId: e.target.value } : r,
                        ),
                      })
                    }
                  >
                    {draft.positions
                      .filter(
                        (p) =>
                          p.id === rack.positionId ||
                          (!draft.racks.some((r) => r.positionId === p.id) &&
                            (!persistedPosition || p.clusterId === persistedPosition.clusterId)),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {draft.clusters.find((c) => c.id === p.clusterId)?.name} / {p.name}
                        </option>
                      ))}
                  </select>
                  {persistedPosition && (
                    <small>
                      Move is limited to this bay. To change bay, delete the rack placement and
                      create it again.
                    </small>
                  )}
                </label>
              )}
              <button disabled={!selected} onClick={remove}>
                Delete selected
              </button>
              <p>
                Delete archives empty physical objects on Save. Inventory-bearing racks cannot be
                removed.
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
