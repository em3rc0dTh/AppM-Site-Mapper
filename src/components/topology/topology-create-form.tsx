'use client';

import { useState, type FormEvent } from 'react';

import type { TopologyKind } from '@/modules/topology/domain/entities';

function createErrorMessage(error: string): string {
  const known: Readonly<Record<string, string>> = {
    BOUNDARY_OUTSIDE_PARENT: 'Structure footprint must stay inside the Site boundary.',
    INVALID_POLYGON: 'The physical footprint is invalid.',
    INVALID_PARENT: 'The selected parent is not valid for this entity.',
    INVALID_NAME: 'Name is required.',
  };

  return known[error] ?? error.replaceAll('_', ' ');
}

export function TopologyCreateForm({
  kind,
  parentId,
}: Readonly<{ kind: TopologyKind; parentId: string | null }>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [containerVariant, setContainerVariant] = useState<'RACK' | 'CONTAINER'>('RACK');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      kind,
      parentId,
      name: String(form.get('name') ?? ''),
    };

    if (kind === 'STRUCTURE') {
      const widthValue = String(form.get('widthMm') ?? '').trim();
      const depthValue = String(form.get('depthMm') ?? '').trim();
      const hasWidth = widthValue.length > 0;
      const hasDepth = depthValue.length > 0;

      if (hasWidth !== hasDepth) {
        setError('Enter both width and depth, or leave both empty to draw the footprint.');
        setBusy(false);
        return;
      }

      if (hasWidth && hasDepth) {
        const width = Number(widthValue);
        const depth = Number(depthValue);
        const x = Number(form.get('xMm') ?? 0);
        const y = Number(form.get('yMm') ?? 0);

        if (
          !Number.isFinite(width) ||
          !Number.isFinite(depth) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          width <= 0 ||
          depth <= 0
        ) {
          setError(
            'Structure dimensions and coordinates must be finite; width/depth must be positive.',
          );
          setBusy(false);
          return;
        }

        payload.polygon = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + depth },
          { x, y: y + depth },
        ];
      }
    }

    if (kind === 'ROOM_SUBSTRUCTURE') {
      payload.roomVariant = String(form.get('variant') ?? 'ROOM');
    }

    if (kind === 'CONTAINER_CLUSTER_BAY') {
      payload.clusterVariant = String(form.get('variant') ?? 'CONTAINER_CLUSTER');
    }

    if (kind === 'POSITION') {
      payload.coordinate = {
        row: String(form.get('row') ?? ''),
        column: Number(form.get('column') ?? 0),
      };
    }

    if (kind === 'CONTAINER_RACK') {
      const variant = String(form.get('variant') ?? 'RACK');
      payload.containerVariant = variant;
      if (variant === 'RACK') {
        payload.totalU = Number(form.get('totalU') ?? 42);
      }
      payload.dimensionsMm = {
        width: Number(form.get('widthMm') ?? 600),
        depth: Number(form.get('depthMm') ?? 600),
      };
    }

    if (kind === 'DEVICE' || kind === 'EQUIPMENT') {
      payload.serialNumber = String(form.get('serialNumber') ?? '');
      payload.category = String(form.get('category') ?? '');
    }

    const endpoint = kind === 'STRUCTURE' ? '/api/spatial/structures' : '/api/topology';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as {
      error?: string;
      href?: string;
      node?: { id: string };
    };

    if (!response.ok) {
      setError(createErrorMessage(result.error ?? 'CREATE_FAILED'));
      setBusy(false);
      return;
    }

    if (result.href) {
      window.location.assign(result.href);
      return;
    }

    window.location.reload();
  }

  return (
    <form className="create-form" onSubmit={submit}>
      <strong>
        {kind === 'CONTAINER_RACK'
          ? 'Create rack / container'
          : `Create ${kind.replaceAll('_', ' ').toLowerCase()}`}
      </strong>
      {kind === 'CONTAINER_RACK' ? (
        <label className="create-form-field">
          <span>Name</span>
          <input aria-label="Name" name="name" placeholder="e.g. Rack A-01" required />
          <small>Human-readable identifier used in the hierarchy, search and operational views.</small>
        </label>
      ) : (
        <input aria-label="Name" name="name" placeholder="Name" required />
      )}
      {kind === 'STRUCTURE' && (
        <fieldset className="create-form-physical">
          <legend>Initial physical footprint · optional</legend>
          <div className="topology-crud-grid">
            <input
              aria-label="Structure width in millimetres"
              name="widthMm"
              type="number"
              min="1"
              step="1"
              placeholder="Width mm"
            />
            <input
              aria-label="Structure depth in millimetres"
              name="depthMm"
              type="number"
              min="1"
              step="1"
              placeholder="Depth mm"
            />
            <input
              aria-label="Structure X coordinate in millimetres"
              name="xMm"
              type="number"
              step="1"
              defaultValue="0"
              placeholder="X mm"
            />
            <input
              aria-label="Structure Y coordinate in millimetres"
              name="yMm"
              type="number"
              step="1"
              defaultValue="0"
              placeholder="Y mm"
            />
          </div>
          <small>Leave width/depth empty to draw an irregular footprint after creation.</small>
        </fieldset>
      )}
      {kind === 'ROOM_SUBSTRUCTURE' && (
        <select aria-label="Entity variant" name="variant" defaultValue="ROOM">
          <option value="ROOM">Room</option>
          <option value="SUBSTRUCTURE">Substructure</option>
        </select>
      )}
      {kind === 'CONTAINER_CLUSTER_BAY' && (
        <select aria-label="Entity variant" name="variant" defaultValue="CONTAINER_CLUSTER">
          <option value="CONTAINER_CLUSTER">ContainerCluster</option>
          <option value="BAY">Bay</option>
        </select>
      )}
      {kind === 'POSITION' && (
        <>
          <input aria-label="Grid row" name="row" placeholder="Row (A)" required />
          <input
            aria-label="Grid column"
            name="column"
            type="number"
            min="1"
            placeholder="Column"
            required
          />
        </>
      )}
      {kind === 'CONTAINER_RACK' && (
        <fieldset className="create-form-physical create-form-placement">
          <legend>Physical asset</legend>
          <p className="create-form-help">
            Rack = equipment frame measured in rack units (U). Container = physical enclosure or
            cabinet without rack-unit capacity.
          </p>

          <label className="create-form-field">
            <span>Type</span>
            <select
              aria-label="Entity variant"
              name="variant"
              value={containerVariant}
              onChange={(event) =>
                setContainerVariant(event.target.value === 'CONTAINER' ? 'CONTAINER' : 'RACK')
              }
            >
              <option value="RACK">Rack</option>
              <option value="CONTAINER">Container</option>
            </select>
            <small>Choose what will physically occupy this 600 × 600 mm Position.</small>
          </label>

          {containerVariant === 'RACK' && (
            <label className="create-form-field">
              <span>Rack capacity (U)</span>
              <input
                aria-label="Rack capacity in U"
                name="totalU"
                type="number"
                min="1"
                defaultValue="42"
              />
              <small>
                Vertical mounting capacity. 1U is one standard rack unit; 42U is a common full-height
                rack.
              </small>
            </label>
          )}

          <div className="topology-crud-grid">
            <label className="create-form-field">
              <span>Width (mm)</span>
              <input
                aria-label="Physical width in millimetres"
                name="widthMm"
                type="number"
                min="1"
                step="1"
                defaultValue="600"
                required
              />
              <small>Front-facing physical width of the asset.</small>
            </label>

            <label className="create-form-field">
              <span>Depth (mm)</span>
              <input
                aria-label="Physical depth in millimetres"
                name="depthMm"
                type="number"
                min="1"
                step="1"
                defaultValue="600"
                required
              />
              <small>Front-to-back physical depth of the asset.</small>
            </label>
          </div>

          <small className="create-form-help">
            The selected Position is the placement anchor. These dimensions describe the asset; they
            do not resize the ContainerCluster/Bay slot run.
          </small>
        </fieldset>
      )}
      {(kind === 'DEVICE' || kind === 'EQUIPMENT') && (
        <>
          <input aria-label="Serial number" name="serialNumber" placeholder="Serial number" />
          <input aria-label="Category" name="category" placeholder="Category" />
        </>
      )}
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create'}
      </button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}
