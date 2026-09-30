'use client';

import { useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { TopologyKind } from '@/modules/topology/domain/entities';
import { polygonInsidePolygon, type PointMm } from '@/modules/spatial/domain/geometry';
import { PolygonEditor } from '@/components/spatial/polygon-editor';

export function TopologyCreateControl({
  kind,
  parentId,
  boundaryContext = [],
}: {
  kind: TopologyKind;
  parentId: string | null;
  boundaryContext?: readonly PointMm[];
}) {
  const [open, setOpen] = useState(false);
  return <div className="spatial-create-control">
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>+ CREATE {kind === 'ROOM_SUBSTRUCTURE' ? 'ROOM' : kind.replaceAll('_', ' ')}</button>
    {open && <div className="spatial-create-popover"><TopologyCreateForm kind={kind} parentId={parentId} boundaryContext={boundaryContext} onCancel={() => setOpen(false)} /></div>}
  </div>;
}

export function TopologyCreateForm({ kind, parentId, boundaryContext = [], onCancel }: Readonly<{
  kind: TopologyKind;
  parentId: string | null;
  boundaryContext?: readonly PointMm[];
  onCancel?: () => void;
}>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const spatial = kind === 'SITE' || kind === 'STRUCTURE' || kind === 'ROOM_SUBSTRUCTURE';
  async function create(payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/topology', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'CREATE_FAILED');
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'CREATE_FAILED'); setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = { kind, parentId, name: String(form.get('name') ?? '').trim() };
    if (kind === 'ROOM_SUBSTRUCTURE') payload.roomVariant = String(form.get('variant') ?? 'ROOM');
    if (kind === 'DEVICE' || kind === 'EQUIPMENT') {
      payload.serialNumber = String(form.get('serialNumber') ?? '');
      payload.category = String(form.get('category') ?? '');
    }
    if (spatial) {
      setError(null); setPending(payload);
      setHost(formRef.current?.closest('.operational-stage') ?? null);
    } else void create(payload);
  }
  if (['CONTAINER_CLUSTER_BAY', 'POSITION', 'CONTAINER_RACK'].includes(kind)) {
    return <p>Create and place this object in the Room Blueprint.</p>;
  }
  const editor = pending && <div className="spatial-create-overlay"><PolygonEditor
    title={`DRAW ${kind === 'ROOM_SUBSTRUCTURE' ? 'ROOM' : kind} BOUNDARY · ${String(pending.name)}`}
    context={boundaryContext}
    validate={
      kind === 'STRUCTURE' && boundaryContext.length >= 3
        ? (polygon) =>
            polygonInsidePolygon(polygon, boundaryContext)
              ? null
              : 'Structure boundary must remain inside the Site boundary.'
        : undefined
    }
    onConfirm={(polygon: PointMm[]) => void create({ ...pending, polygon })}
    onCancel={() => { setPending(null); setError(null); }} busy={busy} error={error}
    confirmLabel={kind === 'SITE' ? 'Save Site' : kind === 'STRUCTURE' ? 'Save Structure' : 'Save Room'}
  /></div>;
  return <>
    <form ref={formRef} className="create-form spatial-metadata-form" onSubmit={submit}>
      <strong>Create {kind === 'ROOM_SUBSTRUCTURE' ? 'Room' : kind.toLowerCase()}</strong>
      <input autoFocus aria-label="Name" name="name" placeholder="Name" required maxLength={120} disabled={busy || !!pending} />
      {kind === 'ROOM_SUBSTRUCTURE' && <select aria-label="Entity variant" name="variant" defaultValue="ROOM" disabled={!!pending}>
        <option value="ROOM">Room</option><option value="SUBSTRUCTURE">Substructure</option>
      </select>}
      {(kind === 'DEVICE' || kind === 'EQUIPMENT') && <>
        <input aria-label="Serial number" name="serialNumber" placeholder="Serial number" />
        <input aria-label="Category" name="category" placeholder="Category" />
      </>}
      <div className="spatial-form-actions">
        {onCancel && <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>}
        <button type="submit" disabled={busy || !!pending}>{busy ? 'Creating…' : spatial ? 'Define boundary' : 'Create'}</button>
      </div>
      {error && !pending && <span className="form-error" role="alert">{error}</span>}
    </form>
    {editor && (host ? createPortal(editor, host) : editor)}
  </>;
}
