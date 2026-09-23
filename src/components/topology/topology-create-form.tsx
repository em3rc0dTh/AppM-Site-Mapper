'use client';

import { useState, type FormEvent } from 'react';

import type { TopologyKind } from '@/modules/topology/domain/entities';

export function TopologyCreateForm({
  kind,
  parentId,
}: Readonly<{ kind: TopologyKind; parentId: string | null }>) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      payload.containerVariant = String(form.get('variant') ?? 'RACK');
      payload.totalU = Number(form.get('totalU') ?? 42);
    }

    if (kind === 'DEVICE' || kind === 'EQUIPMENT') {
      payload.serialNumber = String(form.get('serialNumber') ?? '');
      payload.category = String(form.get('category') ?? '');
    }

    const response = await fetch('/api/topology', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? 'CREATE_FAILED');
      setBusy(false);
      return;
    }

    window.location.reload();
  }

  return (
    <form className="create-form" onSubmit={submit}>
      <strong>Create {kind.replaceAll('_', ' ').toLowerCase()}</strong>
      <input aria-label="Name" name="name" placeholder="Name" required />
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
        <>
          <select aria-label="Entity variant" name="variant" defaultValue="RACK">
            <option value="RACK">Rack</option>
            <option value="CONTAINER">Container</option>
          </select>
          <input
            aria-label="Rack capacity in U"
            name="totalU"
            type="number"
            min="1"
            defaultValue="42"
          />
        </>
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
