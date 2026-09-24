'use client';

import { useState, type FormEvent } from 'react';

import type { TopologyKind } from '@/modules/topology/domain/entities';

function createErrorMessage(error: string): string {
  const known: Readonly<Record<string, string>> = {
    BOUNDARY_OUTSIDE_PARENT: 'Structure footprint must stay inside the Site boundary.',
    INVALID_POLYGON: 'The physical footprint is invalid.',
    INVALID_PARENT: 'The selected parent is not valid for this entity.',
    INVALID_NAME: 'Name is required.',
    RACK_CLUSTER_RUN_REQUIRED:
      'Place this ContainerCluster/Bay on the Blueprint before adding a Rack or Container.',
    RACK_ROOM_BOUNDARY_REQUIRED: 'Define the Room boundary before placing a Rack or Container.',
    RACK_ANCHOR_OUTSIDE_CLUSTER_RUN:
      'The selected Position is not part of this ContainerCluster/Bay run.',
    RACK_WIDTH_EXCEEDS_CLUSTER_RUN:
      'This width needs more 600 mm slots than remain from the selected Position to the end of the run.',
    RACK_FOOTPRINT_OUTSIDE_ROOM: 'The Rack/Container depth would extend outside the Room boundary.',
    RACK_FOOTPRINT_COLLISION:
      'This Rack/Container footprint overlaps another placed Rack/Container.',
  };

  return known[error] ?? error.replaceAll('_', ' ');
}

function createTitle(kind: TopologyKind): string {
  const titles: Readonly<Record<TopologyKind, string>> = {
    NETWORK: 'Create network',
    SITE: 'Create site',
    STRUCTURE: 'Create structure',
    LEVEL: 'Create level',
    ROOM_SUBSTRUCTURE: 'Create room / substructure',
    CONTAINER_CLUSTER_BAY: 'Create container cluster / bay',
    POSITION: 'Create position',
    CONTAINER_RACK: 'Create rack / container',
    DEVICE: 'Create device',
    EQUIPMENT: 'Create equipment',
  };

  return titles[kind];
}

function createDescription(kind: TopologyKind): string {
  const descriptions: Readonly<Record<TopologyKind, string>> = {
    NETWORK: 'Top-level infrastructure network.',
    SITE: 'Physical site or facility contained by this network.',
    STRUCTURE:
      'Physical building or structure inside the Site. Its footprint can be drawn after creation.',
    LEVEL:
      'Floor or hierarchy level inside the Structure. Levels do not own a separate polygon by default.',
    ROOM_SUBSTRUCTURE:
      'Physical area on this Level. Choose Room or Substructure; both use a Blueprint boundary.',
    CONTAINER_CLUSTER_BAY:
      'Linear group of 600 × 600 mm slots. After creation, mark its first and last slot on the Room Blueprint.',
    POSITION:
      'One addressable 600 × 600 mm slot inside a ContainerCluster/Bay. Cluster runs normally generate these automatically.',
    CONTAINER_RACK: 'Physical Rack or Container placed in the selected Position.',
    DEVICE: 'Inventory Device mounted inside the selected Rack or Container.',
    EQUIPMENT: 'Inventory Equipment mounted inside the selected Rack or Container.',
  };

  return descriptions[kind];
}

function namePlaceholder(kind: TopologyKind): string {
  const placeholders: Readonly<Record<TopologyKind, string>> = {
    NETWORK: 'e.g. Site Mapper Network',
    SITE: 'e.g. SANITAS PERÚ S.A.',
    STRUCTURE: 'e.g. Main Building',
    LEVEL: 'e.g. Level 1',
    ROOM_SUBSTRUCTURE: 'e.g. Server Room',
    CONTAINER_CLUSTER_BAY: 'e.g. Bay-01',
    POSITION: 'e.g. A-1',
    CONTAINER_RACK: 'e.g. Rack A-01',
    DEVICE: 'e.g. Switch-01',
    EQUIPMENT: 'e.g. UPS-01',
  };

  return placeholders[kind];
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
      <div className="create-form-intro">
        <strong>{createTitle(kind)}</strong>
        <p>{createDescription(kind)}</p>
      </div>

      <label className="create-form-field">
        <span>Name</span>
        <input aria-label="Name" name="name" placeholder={namePlaceholder(kind)} required />
        <small>Human-readable identifier shown in the hierarchy and operational views.</small>
      </label>
      {kind === 'STRUCTURE' && (
        <fieldset className="create-form-physical">
          <legend>Initial physical footprint · optional</legend>
          <p className="create-form-help">
            Optional shortcut for a rectangular Structure. Leave width and depth empty if you want
            to draw an irregular footprint point by point.
          </p>
          <div className="topology-crud-grid">
            <label className="create-form-field">
              <span>Width (mm)</span>
              <input
                aria-label="Structure width in millimetres"
                name="widthMm"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 12000"
              />
              <small>Left-to-right physical span of the initial rectangle.</small>
            </label>
            <label className="create-form-field">
              <span>Depth (mm)</span>
              <input
                aria-label="Structure depth in millimetres"
                name="depthMm"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 8000"
              />
              <small>Front-to-back physical span of the initial rectangle.</small>
            </label>
            <label className="create-form-field">
              <span>Start X (mm)</span>
              <input
                aria-label="Structure X coordinate in millimetres"
                name="xMm"
                type="number"
                step="1"
                defaultValue="0"
              />
              <small>Horizontal offset from the Site drafting origin.</small>
            </label>
            <label className="create-form-field">
              <span>Start Y (mm)</span>
              <input
                aria-label="Structure Y coordinate in millimetres"
                name="yMm"
                type="number"
                step="1"
                defaultValue="0"
              />
              <small>Vertical offset from the Site drafting origin.</small>
            </label>
          </div>
        </fieldset>
      )}
      {kind === 'ROOM_SUBSTRUCTURE' && (
        <fieldset className="create-form-physical">
          <legend>Physical area type</legend>
          <label className="create-form-field">
            <span>Type</span>
            <select aria-label="Entity variant" name="variant" defaultValue="ROOM">
              <option value="ROOM">Room</option>
              <option value="SUBSTRUCTURE">Substructure</option>
            </select>
            <small>
              Choose the classification that matches your operational model. Both variants own a
              Blueprint boundary.
            </small>
          </label>
          <small className="create-form-help">
            After creation, draw the boundary on the Level Blueprint. The polygon becomes the
            physical footprint for contained clusters and bays.
          </small>
        </fieldset>
      )}
      {kind === 'CONTAINER_CLUSTER_BAY' && (
        <fieldset className="create-form-physical">
          <legend>Slot group type</legend>
          <label className="create-form-field">
            <span>Type</span>
            <select aria-label="Entity variant" name="variant" defaultValue="CONTAINER_CLUSTER">
              <option value="CONTAINER_CLUSTER">Container cluster</option>
              <option value="BAY">Bay</option>
            </select>
            <small>
              Both types use the same physical rule in MK1: a straight horizontal or vertical run of
              600 × 600 mm slots.
            </small>
          </label>
          <small className="create-form-help">
            After creation, click the first slot and the last slot on the Room Blueprint. Site
            Mapper creates every Position between them automatically.
          </small>
        </fieldset>
      )}
      {kind === 'POSITION' && (
        <fieldset className="create-form-physical">
          <legend>Grid address</legend>
          <p className="create-form-help">
            A Position is one 600 × 600 mm slot. ContainerCluster/Bay runs normally create these
            slots automatically.
          </p>
          <div className="topology-crud-grid">
            <label className="create-form-field">
              <span>Row</span>
              <input aria-label="Grid row" name="row" placeholder="e.g. A" required />
              <small>Lettered Blueprint row.</small>
            </label>
            <label className="create-form-field">
              <span>Column</span>
              <input
                aria-label="Grid column"
                name="column"
                type="number"
                min="1"
                placeholder="e.g. 1"
                required
              />
              <small>Numbered Blueprint column.</small>
            </label>
          </div>
        </fieldset>
      )}
      {kind === 'CONTAINER_RACK' && (
        <fieldset className="create-form-physical create-form-placement">
          <legend>Physical asset</legend>
          <p className="create-form-help">
            Rack = physical asset with rack-unit capacity (U). Container = physical Container
            variant without rack-unit capacity.
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
                Vertical mounting capacity. 1U is one standard rack unit; 42U is a common
                full-height rack.
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
              <small>
                Width runs along the ContainerCluster/Bay. It consumes consecutive 600 mm slots: 900
                mm uses 2 slots. It cannot extend past the end of the run or through occupied slots.
              </small>
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
              <small>
                Footprint depth perpendicular to the run — the vertical dimension you see on the
                Blueprint. It may exceed 600 mm if it remains inside the Room and collision-free.
              </small>
            </label>
          </div>

          <small className="create-form-help">
            The selected Position is the placement anchor. Width consumes the required slots from
            that anchor toward the run end; depth may project beyond the 600 mm slot. These
            dimensions do not resize the ContainerCluster/Bay itself.
          </small>
        </fieldset>
      )}
      {(kind === 'DEVICE' || kind === 'EQUIPMENT') && (
        <fieldset className="create-form-physical">
          <legend>Inventory identity · optional</legend>
          <label className="create-form-field">
            <span>Serial number</span>
            <input
              aria-label="Serial number"
              name="serialNumber"
              placeholder="Manufacturer serial or asset serial"
            />
            <small>Use the physical serial when available; this field may be left empty.</small>
          </label>
          <label className="create-form-field">
            <span>Category</span>
            <input
              aria-label="Category"
              name="category"
              placeholder={kind === 'DEVICE' ? 'e.g. Network switch' : 'e.g. UPS'}
            />
            <small>Operational classification used to describe what this asset is.</small>
          </label>
        </fieldset>
      )}
      <button type="submit" disabled={busy}>
        {busy
          ? 'Creating…'
          : kind === 'CONTAINER_RACK'
            ? `Create ${containerVariant === 'RACK' ? 'Rack' : 'Container'}`
            : 'Create'}
      </button>
      {error && <span className="form-error">{error}</span>}
    </form>
  );
}
