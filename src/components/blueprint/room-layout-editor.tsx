'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  polygonBounds,
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
  const t = useTranslations('roomEditor');
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
          INVALID_CLUSTER: t('invalidCluster'),
          INVALID_DIMENSIONS: t('invalidDimensions'),
          NEGATIVE_POSITION_REFERENCE: t('negativeGrid'),
          BAY_FRONTAGE_TOO_NARROW: t('bayNarrow'),
          RACK_OUTSIDE_ROOM: t('rackOutside'),
          RACK_DEPTH_BLOCKED_BY_BAY: t('rackBlocked'),
          RACK_COLLISION: t('rackCollision'),
          NO_VALID_GRID_ANCHOR: t('noGrid'),
        } satisfies Record<ReturnType<typeof explainRackPlacementFailure>, string>;
        const cluster = draft.clusters.find((candidate) => candidate.id === clusterId);
        const bounds = cluster ? polygonBounds(cluster.polygon) : null;
        const measured = bounds
          ? t('measured', {
              name: cluster?.name ?? '',
              minX: Math.round(bounds.minX),
              maxX: Math.round(bounds.maxX),
              y: Math.round(bounds.minY),
              width,
              depth,
            })
          : '';
        setSelected(clusterId);
        setError(`${t('blocked', { reason, detail: messages[reason] })}${measured}`);
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
      setError(t('chooseCellError'));
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
      setError(t('occupiedCell'));
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
        setError(t('removePositions'));
        return;
      }
      change({ ...draft, clusters: draft.clusters.filter((c) => c.id !== selected) });
    } else if (draft.positions.some((p) => p.id === selected)) {
      if (draft.racks.some((r) => r.positionId === selected)) {
        setError(t('removeRack'));
        return;
      }
      change({ ...draft, positions: draft.positions.filter((p) => p.id !== selected) });
    } else change({ ...draft, racks: draft.racks.filter((r) => r.id !== selected) });
    setSelected('');
  }
  async function save() {
    if (validation || boundary || placement) {
      setError(validation ?? t('finishOperation'));
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
      if (!response.ok) throw new Error(t('saveFailed'));
      setDraft(result.draft);
      setSaved(result.draft);
      setPast([]);
      setFuture([]);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
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
      {t('bayCluster')}
      <select name="clusterId" required defaultValue="">
        <option value="">{t('selectBay')}</option>
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
        <strong>{editing ? t('editDraft') : t('explore')}</strong>
        {canWrite && !editing && <button onClick={() => setEditing(true)}>{t('editRoom')}</button>}
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
              {t('undo')}
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
              {t('redo')}
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
              {t('cancel')}
            </button>
            <button
              disabled={busy || !!validation || !!boundary || !!placement}
              onClick={() => void save()}
            >
              {busy ? t('saving') : t('saveLayout')}
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
                  ? t('editRoomBoundary')
                  : t('editBayTitle', { name: boundary.name })
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
                if (!polygonInsidePolygon(polygon, draft.polygon)) return t('bayOutside');
                if (
                  draft.clusters.some(
                    (cluster) =>
                      cluster.id !== boundary.id && polygonsOverlapArea(polygon, cluster.polygon),
                  )
                )
                  return t('bayOverlap');
                return null;
              }}
              onConfirm={applyBoundary}
              onCancel={() => setBoundary(null)}
              confirmLabel={t('applyDraft')}
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
            <div className="mk-empty-boundary">{t('drawRoom')}</div>
          )}
        </div>
        {editing && (
          <aside className="mk-draft-inspector">
            <fieldset disabled={busy || !!boundary}>
              <h3>{t('geometry')}</h3>
              <button
                type="button"
                onClick={() => {
                  setPlacement(null);
                  setBoundary({ kind: 'room' });
                }}
              >
                {draft.polygon.length ? t('editRoomBoundary') : t('drawRoomBoundary')}
              </button>
              <p>{t('geometryHelp')}</p>
              {placement && (
                <div className="spatial-placement-prompt" role="status">
                  <strong>
                    {t('clickTo')}{' '}
                    {placement.kind === 'move'
                      ? t('moveAnchor')
                      : t('placeObject', { name: placement.name })}
                    .
                  </strong>
                  <button
                    type="button"
                    onClick={() => {
                      setPlacement(null);
                      setError('');
                    }}
                  >
                    {t('cancelPlacement')}
                  </button>
                </div>
              )}
              <details>
                <summary>{t('drawBay')}</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="bay" />
                  <label>
                    {t('name')}
                    <input name="name" required maxLength={120} />
                  </label>
                  <label>
                    {t('type')}
                    <select name="variant">
                      <option value="BAY">{t('bay')}</option>
                      <option value="CONTAINER_CLUSTER">{t('cluster')}</option>
                    </select>
                  </label>
                  <button disabled={draft.polygon.length < 3}>{t('drawBoundary')}</button>
                </form>
              </details>
              <details>
                <summary>{t('placeRack')}</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="rack" />
                  <label>
                    {t('name')}
                    <input name="name" required maxLength={120} />
                  </label>
                  {selectBay}
                  <label>
                    {t('widthFootprint')}
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
                    {t('depthFootprint')}
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
                    {t('capacityU')}
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
                  <button>{t('rackLeft')}</button>
                </form>
              </details>
              <details>
                <summary>{t('emptyPosition')}</summary>
                <form onSubmit={add}>
                  <input type="hidden" name="kind" value="position" />
                  <label>
                    {t('name')}
                    <input name="name" required maxLength={120} />
                  </label>
                  {selectBay}
                  <button>{t('chooseCell')}</button>
                </form>
              </details>
              <h3>{t('selection')}</h3>
              <select
                aria-label={t('selectedObject')}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">{t('selectObject')}</option>
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
                  {t('editBayBoundary')}
                </button>
              )}
              {position && !rack && (
                <>
                  <p>{t('anchor', { row: position.row, column: position.column })}</p>
                  <button
                    type="button"
                    onClick={() => setPlacement({ kind: 'move', id: position.id })}
                  >
                    {t('moveOnCanvas')}
                  </button>
                </>
              )}
              {rack && position && (
                <p>
                  {t('placementDescription', {
                    minX: rack.x,
                    maxX: rack.x + rack.width,
                    y: rack.y,
                    row: position.row,
                    column: position.column,
                  })}
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
                    {t('name')}
                    <input name="name" defaultValue={rack.name} required maxLength={120} />
                  </label>
                  <label>
                    {t('width')}
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
                    {t('depth')}
                    <input
                      name="depth"
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={rack.depth}
                      required
                    />
                  </label>
                  <p>{t('rackCapacityHelp', { totalU: rack.totalU })}</p>
                  <button>{t('applyRack')}</button>
                </form>
              )}
              <button type="button" disabled={!selected || !!placement} onClick={remove}>
                {t('removeSelected')}
              </button>
              <p>{t('archiveHelp')}</p>
            </fieldset>
          </aside>
        )}
      </div>
      {editing && validation && (
        <p className="mk-draft-feedback" role="status">
          {t('correction', { error: validation })}
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
