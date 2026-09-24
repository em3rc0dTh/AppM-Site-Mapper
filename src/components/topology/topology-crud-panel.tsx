'use client';

import { useState, type FormEvent } from 'react';

import { TopologyCreateForm } from '@/components/topology/topology-create-form';
import type { TopologyKind, TopologyNode } from '@/modules/topology/domain/entities';

function label(kind: TopologyKind): string {
  return kind.replaceAll('_', ' ').toLowerCase();
}

function errorMessage(error: string): string {
  const known: Readonly<Record<string, string>> = {
    HAS_ACTIVE_CHILDREN: 'Archive contained entities first.',
    CAS_RELEASE_REQUIRED: 'Release rack allocations before changing rack capacity or variant.',
    POSITION_COORDINATE_OCCUPIED: 'That grid coordinate is already occupied.',
    INVALID_COORDINATE: 'Enter a valid grid coordinate.',
    INVALID_RACK_CAPACITY: 'Rack capacity must be a positive integer.',
    INVALID_DIMENSIONS: 'Physical dimensions must be positive numbers.',
    INVALID_NAME: 'Name is required.',
  };
  return known[error] ?? error.replaceAll('_', ' ');
}

export function TopologyCrudPanel({
  node,
  childKinds,
}: Readonly<{
  node: TopologyNode;
  childKinds: readonly TopologyKind[];
}>) {
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState<TopologyKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editContainerVariant, setEditContainerVariant] = useState<'RACK' | 'CONTAINER'>(
    node.kind === 'CONTAINER_RACK' ? node.variant : 'RACK',
  );

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      action: 'update',
      name: String(form.get('name') ?? ''),
    };

    if (node.kind === 'ROOM_SUBSTRUCTURE') {
      payload.roomVariant = String(form.get('variant') ?? node.variant);
    }
    if (node.kind === 'CONTAINER_CLUSTER_BAY') {
      payload.clusterVariant = String(form.get('variant') ?? node.variant);
    }
    if (node.kind === 'POSITION') {
      payload.coordinate = {
        row: String(form.get('row') ?? node.coordinate.row),
        column: Number(form.get('column') ?? node.coordinate.column),
      };
    }
    if (node.kind === 'CONTAINER_RACK') {
      payload.containerVariant = String(form.get('variant') ?? node.variant);
      if (node.variant === 'RACK' || form.get('variant') === 'RACK') {
        payload.totalU = Number(form.get('totalU') ?? node.totalU ?? 42);
      }
      payload.dimensionsMm = {
        width: Number(form.get('widthMm') ?? node.dimensionsMm?.width ?? 600),
        depth: Number(form.get('depthMm') ?? node.dimensionsMm?.depth ?? 600),
        ...(String(form.get('heightMm') ?? '').trim()
          ? { height: Number(form.get('heightMm')) }
          : {}),
      };
    }
    if (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') {
      payload.serialNumber = String(form.get('serialNumber') ?? '').trim() || null;
      payload.category = String(form.get('category') ?? '').trim() || null;
    }

    const response = await fetch(`/api/topology/${node.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(errorMessage(result.error ?? 'UPDATE_FAILED'));
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  async function archive() {
    if (!window.confirm(`Archive ${node.name}? This keeps the record in MongoDB.`)) {
      return;
    }

    setBusy(true);
    setError(null);
    const response = await fetch(`/api/topology/${node.id}`, { method: 'DELETE' });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(errorMessage(result.error ?? 'ARCHIVE_FAILED'));
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  async function restore() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/topology/${node.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'restore' }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(errorMessage(result.error ?? 'RESTORE_FAILED'));
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  return (
    <section className="topology-crud" aria-label="Entity CRUD">
      <div className="topology-crud-heading">
        <span>ENTITY MANAGEMENT</span>
        <strong>Persistent record</strong>
      </div>

      <div className="topology-crud-actions">
        {node.lifecycle === 'ACTIVE' ? (
          <>
            <button type="button" onClick={() => setEditing((value) => !value)} disabled={busy}>
              {editing ? 'Close edit' : 'Edit'}
            </button>
            <button type="button" className="is-danger" onClick={archive} disabled={busy}>
              Archive
            </button>
          </>
        ) : (
          <button type="button" onClick={restore} disabled={busy}>
            Restore
          </button>
        )}
      </div>

      {editing && node.lifecycle === 'ACTIVE' && (
        <form className="topology-crud-form" onSubmit={update}>
          <label>
            <span>Name</span>
            <input name="name" defaultValue={node.name} required />
            <small>Display name used in the hierarchy and operational views.</small>
          </label>

          {node.kind === 'ROOM_SUBSTRUCTURE' && (
            <label>
              <span>Area type</span>
              <select name="variant" defaultValue={node.variant}>
                <option value="ROOM">Room</option>
                <option value="SUBSTRUCTURE">Substructure</option>
              </select>
              <small>
                Changes how this physical area is classified; its Blueprint boundary remains the
                same persisted polygon.
              </small>
            </label>
          )}

          {node.kind === 'CONTAINER_CLUSTER_BAY' && (
            <label>
              <span>Slot group type</span>
              <select name="variant" defaultValue={node.variant}>
                <option value="CONTAINER_CLUSTER">Container cluster</option>
                <option value="BAY">Bay</option>
              </select>
              <small>
                Classification only. Edit the start/end run on the map to change physical length or
                orientation.
              </small>
            </label>
          )}

          {node.kind === 'POSITION' && (
            <>
              <p className="topology-crud-help">
                Position is the 600 × 600 mm Blueprint slot address. Changing it moves the logical
                slot coordinate; duplicate coordinates are rejected.
              </p>
              <div className="topology-crud-grid">
                <label>
                  <span>Row</span>
                  <input name="row" defaultValue={node.coordinate.row} required />
                  <small>Lettered Blueprint row, for example A or B.</small>
                </label>
                <label>
                  <span>Column</span>
                  <input
                    name="column"
                    type="number"
                    min="1"
                    defaultValue={node.coordinate.column}
                    required
                  />
                  <small>Numbered Blueprint column, starting at 1.</small>
                </label>
              </div>
            </>
          )}

          {node.kind === 'CONTAINER_RACK' && (
            <>
              <p className="topology-crud-help">
                This asset occupies its parent Position. Dimensions describe the asset itself; they
                do not resize the 600 × 600 mm cluster slot.
              </p>
              <label>
                <span>Physical asset type</span>
                <select
                  name="variant"
                  value={editContainerVariant}
                  onChange={(event) =>
                    setEditContainerVariant(
                      event.target.value === 'CONTAINER' ? 'CONTAINER' : 'RACK',
                    )
                  }
                >
                  <option value="RACK">Rack</option>
                  <option value="CONTAINER">Container</option>
                </select>
                <small>
                  Rack has rack-unit capacity. Container is an enclosure/cabinet without U capacity.
                </small>
              </label>
              <div className="topology-crud-grid">
                {editContainerVariant === 'RACK' && (
                  <label>
                    <span>Rack capacity (U)</span>
                    <input name="totalU" type="number" min="1" defaultValue={node.totalU ?? 42} />
                    <small>Vertical mounting capacity; 1U is one standard rack unit.</small>
                  </label>
                )}
                <label>
                  <span>Width (mm)</span>
                  <input
                    name="widthMm"
                    type="number"
                    min="1"
                    defaultValue={node.dimensionsMm?.width ?? 600}
                  />
                  <small>Front-facing physical width.</small>
                </label>
                <label>
                  <span>Depth (mm)</span>
                  <input
                    name="depthMm"
                    type="number"
                    min="1"
                    defaultValue={node.dimensionsMm?.depth ?? 600}
                  />
                  <small>Front-to-back physical depth.</small>
                </label>
                <label>
                  <span>Height (mm) · optional</span>
                  <input
                    name="heightMm"
                    type="number"
                    min="1"
                    defaultValue={node.dimensionsMm?.height ?? ''}
                  />
                  <small>Overall physical height when known.</small>
                </label>
              </div>
            </>
          )}

          {(node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') && (
            <>
              <label>
                <span>Serial number · optional</span>
                <input name="serialNumber" defaultValue={node.serialNumber ?? ''} />
                <small>Physical manufacturer or asset serial used to identify this unit.</small>
              </label>
              <label>
                <span>Category · optional</span>
                <input name="category" defaultValue={node.category ?? ''} />
                <small>Operational classification, for example Network switch, UPS or PDU.</small>
              </label>
            </>
          )}

          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}

      {node.lifecycle === 'ACTIVE' && childKinds.length > 0 && (
        <div className="topology-create-child">
          <span>ADD CONTAINED INFRASTRUCTURE</span>
          <div className="topology-create-kind-row">
            {childKinds.map((kind) => (
              <button
                type="button"
                key={kind}
                className={creating === kind ? 'is-active' : ''}
                onClick={() => setCreating((current) => (current === kind ? null : kind))}
              >
                + {label(kind)}
              </button>
            ))}
          </div>
          {creating && <TopologyCreateForm kind={creating} parentId={node.id} />}
        </div>
      )}

      {error && <div className="topology-crud-error">{error}</div>}
    </section>
  );
}
