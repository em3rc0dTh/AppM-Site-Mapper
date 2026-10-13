'use client';

import { useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { EquipmentChildMode, TopologyKind } from '@/modules/topology/domain/entities';
import { DEVICE_TYPES, EQUIPMENT_TYPES } from '@/modules/topology/domain/type-parsers';
import {
  polygonInsidePolygon,
  polygonsOverlapArea,
  type PointMm,
} from '@/modules/spatial/domain/geometry';
import { PolygonEditor, type PolygonContextOverlay } from '@/components/spatial/polygon-editor';

export function TopologyCreateControl({
  kind,
  parentId,
  boundaryContext = [],
  boundaryLabel,
  contextOverlays = [],
}: {
  kind: TopologyKind;
  parentId: string | null;
  boundaryContext?: readonly PointMm[];
  boundaryLabel?: string;
  contextOverlays?: readonly PolygonContextOverlay[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="spatial-create-control">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        + CREATE {kind === 'ROOM_SUBSTRUCTURE' ? 'ROOM' : kind.replaceAll('_', ' ')}
      </button>
      {open && (
        <div className="spatial-create-popover">
          <TopologyCreateForm
            kind={kind}
            parentId={parentId}
            boundaryContext={boundaryContext}
            {...(boundaryLabel ? { boundaryLabel } : {})}
            contextOverlays={contextOverlays}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export function TopologyCreateForm({
  kind,
  parentId,
  boundaryContext = [],
  boundaryLabel,
  contextOverlays = [],
  onCancel,
}: Readonly<{
  kind: TopologyKind;
  parentId: string | null;
  boundaryContext?: readonly PointMm[];
  boundaryLabel?: string;
  contextOverlays?: readonly PolygonContextOverlay[];
  onCancel?: () => void;
}>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [equipmentChildMode, setEquipmentChildMode] = useState<EquipmentChildMode>('DYNAMIC');
  const [host, setHost] = useState<Element | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const spatial = kind === 'SITE' || kind === 'STRUCTURE' || kind === 'ROOM_SUBSTRUCTURE';
  async function create(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/topology', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // Handle empty/non-JSON responses (including proxy/server failures) without
      // masking the actual HTTP status as a JSON parsing error.
      const raw = await response.text();
      let result: { error?: string } = {};
      try {
        result = raw ? (JSON.parse(raw) as { error?: string }) : {};
      } catch {
        // The server returned HTML or another unexpected response.
      }
      if (!response.ok) {
        throw new Error(result.error || `CREATE_FAILED_HTTP_${response.status}`);
      }
      if (!raw) throw new Error('CREATE_FAILED_EMPTY_RESPONSE');
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CREATE_FAILED');
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      kind,
      parentId,
      name: String(form.get('name') ?? '').trim(),
    };
    if (kind === 'ROOM_SUBSTRUCTURE') payload.roomVariant = String(form.get('variant') ?? 'ROOM');
    if (kind === 'DEVICE' || kind === 'EQUIPMENT') {
      payload.serialNumber = String(form.get('serialNumber') ?? '');
      payload.category = String(form.get('category') ?? '');
    }
    if (kind === 'DEVICE') {
      payload.deviceType = String(form.get('deviceType') ?? 'CUSTOM');
    }
    if (kind === 'EQUIPMENT') {
      payload.equipmentType = String(form.get('equipmentType') ?? 'CUSTOM');
      payload.childMode = equipmentChildMode;
      if (equipmentChildMode === 'POSITIONAL') {
        payload.childCapacity = Number(form.get('childCapacity'));
        payload.telemetryPointPrefix = String(form.get('telemetryPointPrefix') ?? '');
      }
    }
    if (spatial) {
      setError(null);
      setPending(payload);
      setHost(formRef.current?.closest('.operational-stage') ?? null);
    } else void create(payload);
  }
  if (['CONTAINER_CLUSTER_BAY', 'POSITION', 'CONTAINER_RACK'].includes(kind)) {
    return <p>Create and place this object in the Room Blueprint.</p>;
  }
  const editor = pending && (
    <div className="spatial-create-overlay">
      <PolygonEditor
        title={`DRAW ${kind === 'ROOM_SUBSTRUCTURE' ? 'ROOM' : kind} BOUNDARY · ${String(pending.name)}`}
        context={boundaryContext}
        {...(boundaryLabel ? { contextLabel: boundaryLabel } : {})}
        contextOverlays={contextOverlays}
        validate={(polygon: readonly PointMm[]) => {
          if (kind === 'STRUCTURE' && boundaryContext.length >= 3) {
            if (!polygonInsidePolygon(polygon, boundaryContext))
              return 'Structure must stay inside its surveyed Site boundary.';
          }
          if (kind === 'ROOM_SUBSTRUCTURE') {
            if (boundaryContext.length >= 3 && !polygonInsidePolygon(polygon, boundaryContext))
              return 'Room must stay within the Structure boundary (Level reference).';
            const overlapping = contextOverlays.find((existing) =>
              polygonsOverlapArea(polygon, existing.polygon),
            );
            if (overlapping)
              return `Room overlaps existing space: ${overlapping.label}. Shared walls are allowed, shared area is not.`;
          }
          return null;
        }}
        onConfirm={(polygon: PointMm[]) => void create({ ...pending, polygon })}
        onCancel={() => {
          setPending(null);
          setError(null);
        }}
        busy={busy}
        error={error}
        confirmLabel={
          kind === 'SITE' ? 'Save Site' : kind === 'STRUCTURE' ? 'Save Structure' : 'Save Room'
        }
      />
    </div>
  );
  return (
    <>
      <form ref={formRef} className="create-form spatial-metadata-form" onSubmit={submit}>
        <strong>Create {kind === 'ROOM_SUBSTRUCTURE' ? 'Room' : kind.toLowerCase()}</strong>
        <input
          autoFocus
          aria-label="Name"
          name="name"
          placeholder="Name"
          required
          maxLength={120}
          disabled={busy || !!pending}
        />
        {kind === 'ROOM_SUBSTRUCTURE' && (
          <select
            aria-label="Entity variant"
            name="variant"
            defaultValue="ROOM"
            disabled={!!pending}
          >
            <option value="ROOM">Room</option>
            <option value="SUBSTRUCTURE">Substructure</option>
          </select>
        )}
        {kind === 'DEVICE' && (
          <select aria-label="Device type" name="deviceType" defaultValue="CUSTOM">
            {DEVICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        )}
        {kind === 'EQUIPMENT' && (
          <>
            <select aria-label="Equipment type" name="equipmentType" defaultValue="CUSTOM">
              {EQUIPMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <select
              aria-label="Children mode"
              name="childMode"
              value={equipmentChildMode}
              onChange={(event) => setEquipmentChildMode(event.target.value as EquipmentChildMode)}
            >
              <option value="DYNAMIC">Dynamic children</option>
              <option value="POSITIONAL">Positional slots</option>
            </select>
            {equipmentChildMode === 'POSITIONAL' ? (
              <input
                aria-label="Child capacity"
                name="childCapacity"
                type="number"
                min="1"
                max="256"
                required
                placeholder="Number of child slots"
              />
            ) : null}
            {equipmentChildMode === 'POSITIONAL' && (
              <label>
                MQTT point prefix
                <input
                  name="telemetryPointPrefix"
                  maxLength={80}
                  pattern="[A-Za-z0-9]+(_[A-Za-z0-9]+)*"
                  placeholder="0_2 (optional)"
                  aria-label="MQTT point prefix"
                />
              </label>
            )}
          </>
        )}
        {(kind === 'DEVICE' || kind === 'EQUIPMENT') && (
          <>
            <input aria-label="Serial number" name="serialNumber" placeholder="Serial number" />
            <input aria-label="Category" name="category" placeholder="Category" />
          </>
        )}
        <div className="spatial-form-actions">
          {onCancel && (
            <button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" disabled={busy || !!pending}>
            {busy ? 'Creating…' : spatial ? 'Define boundary' : 'Create'}
          </button>
        </div>
        {error && !pending && (
          <span className="form-error" role="alert">
            {error}
          </span>
        )}
      </form>
      {editor && (host ? createPortal(editor, host) : editor)}
    </>
  );
}
