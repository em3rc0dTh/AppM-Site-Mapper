'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type {
  AccessPort,
  AccessPortDirection,
  AccessPortExposure,
  AccessPortType,
} from '@/modules/topology/domain/entities';

interface PortForm {
  name: string;
  portType: AccessPortType;
  direction: AccessPortDirection;
  exposure: AccessPortExposure;
  connectorType: string;
  protocol: string;
  customType: string;
  feed: '' | 'A' | 'B';
}

const types: readonly AccessPortType[] = ['POWER', 'NETWORK', 'CONTROL', 'DATA', 'GROUND', 'CUSTOM'];
const directions: readonly AccessPortDirection[] = ['INPUT', 'OUTPUT', 'BIDIRECTIONAL'];
const exposures: readonly AccessPortExposure[] = ['INTERNAL', 'EXTERNAL'];

function formFor(port?: AccessPort): PortForm {
  const feed = port?.attributes?.feed;
  return {
    name: port?.name ?? '',
    portType: port?.portType ?? 'NETWORK',
    direction: port?.direction ?? 'BIDIRECTIONAL',
    exposure: port?.exposure ?? 'EXTERNAL',
    connectorType: port?.connectorType ?? '',
    protocol: port?.protocol ?? '',
    customType: port?.customType ?? '',
    feed: feed === 'A' || feed === 'B' ? feed : '',
  };
}

export function AccessPortEditor({
  equipmentId,
  accessPorts,
  canWritePower,
}: Readonly<{
  equipmentId: string;
  accessPorts: readonly AccessPort[];
  canWritePower: boolean;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PortForm>(() => formFor());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = accessPorts.filter((port) => port.lifecycle === 'ACTIVE');
  const editing = active.find((port) => port.id === editingId);
  const canSave = form.name.trim().length > 0 && !busy && (canWritePower || (form.portType !== 'POWER' && editing?.portType !== 'POWER'));

  function patch(change: Partial<PortForm>) {
    setForm((previous) => ({ ...previous, ...change }));
  }

  function reset(port?: AccessPort) {
    setEditingId(port?.id ?? null);
    setForm(formFor(port));
    setError('');
  }

  function openEditor() {
    reset();
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/equipment/${encodeURIComponent(equipmentId)}/access-ports`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(editingId ? { portId: editingId } : {}),
          port: {
            name: form.name.trim(),
            portType: form.portType,
            direction: form.direction,
            exposure: form.exposure,
            ...(form.connectorType.trim() ? { connectorType: form.connectorType.trim() } : {}),
            ...(form.protocol.trim() ? { protocol: form.protocol.trim() } : {}),
            ...(form.customType.trim() ? { customType: form.customType.trim() } : {}),
            ...(form.portType === 'POWER' && form.feed ? { feed: form.feed } : {}),
          },
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `SAVE_FAILED_${response.status}`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SAVE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function archive(port: AccessPort) {
    if (typeof window !== 'undefined' && !window.confirm(`Archive port "${port.name}"? Connected ports cannot be archived.`)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/equipment/${encodeURIComponent(equipmentId)}/access-ports`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ portId: port.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? `ARCHIVE_FAILED_${response.status}`);
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ARCHIVE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="equipment-port-editor">
      <header>
        <strong>ACCESS PORTS</strong>
        <span>{active.length} configured</span>
      </header>
      <div className="equipment-port-editor-list">
        {active.map((port) => (
          <article key={port.id}>
            <div>
              <strong>{port.name}</strong>
              <small>{port.portType} · {port.direction ?? 'UNSPECIFIED'} · {port.exposure}</small>
              {(port.connectorType || port.protocol) && <small>{[port.connectorType, port.protocol].filter(Boolean).join(' · ')}</small>}
            </div>
            <div>
              <button type="button" disabled={busy} onClick={() => { reset(port); setOpen(true); }}>EDIT</button>
              <button type="button" disabled={busy || (!canWritePower && port.portType === 'POWER')} onClick={() => void archive(port)}>ARCHIVE</button>
            </div>
          </article>
        ))}
      </div>
      <button type="button" onClick={openEditor}>+ ADD ACCESS PORT</button>
      {error && !open && <p role="alert" className="form-error">{error}</p>}
      {open && (
        <div className="power-contract-backdrop" role="presentation" onMouseDown={() => !busy && setOpen(false)}>
          <section
            className="power-contract-dialog equipment-access-port-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-port-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>PHYSICAL EQUIPMENT / TERMINAL</small>
                <h2 id="access-port-dialog-title">{editingId ? 'Edit Access Port' : 'Add Access Port'}</h2>
                <p>Configure the physical terminal on this Equipment. Connections are managed separately.</p>
              </div>
              <button type="button" disabled={busy} aria-label="Close Access Port editor" onClick={() => setOpen(false)}>×</button>
            </header>
            <form onSubmit={(event) => void save(event)} className="equipment-access-port-form">
              <label>Name
                <input required maxLength={120} value={form.name} onChange={(event) => patch({ name: event.target.value })} />
              </label>
              <label>Port type
                <select value={form.portType} onChange={(event) => patch({ portType: event.target.value as AccessPortType, feed: '' })}>
                  {types.map((type) => <option key={type} value={type} disabled={type === 'POWER' && !canWritePower}>{type}</option>)}
                </select>
              </label>
              <label>Direction
                <select value={form.direction} onChange={(event) => patch({ direction: event.target.value as AccessPortDirection })}>
                  {directions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>Exposure
                <select value={form.exposure} onChange={(event) => patch({ exposure: event.target.value as AccessPortExposure })}>
                  {exposures.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>Connector
                <input maxLength={120} value={form.connectorType} onChange={(event) => patch({ connectorType: event.target.value })} placeholder="RJ45, SFP+, terminal..." />
              </label>
              <label>Protocol
                <input maxLength={120} value={form.protocol} onChange={(event) => patch({ protocol: event.target.value })} placeholder="Ethernet, Modbus, RS-485..." />
              </label>
              {form.portType === 'CUSTOM' && <label>Custom type
                <input maxLength={120} value={form.customType} onChange={(event) => patch({ customType: event.target.value })} />
              </label>}
              {form.portType === 'POWER' && <label>Feed
                <select value={form.feed} onChange={(event) => patch({ feed: event.target.value as PortForm['feed'] })}>
                  <option value="">Not assigned</option><option value="A">Feed A</option><option value="B">Feed B</option>
                </select>
              </label>}
              <p>Archiving or changing the electrical identity of a connected terminal is blocked. Power Paths remain authoritative.</p>
              {error && <p role="alert" className="form-error">{error}</p>}
              <footer>
                <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" disabled={!canSave}>{busy ? 'Saving…' : 'SAVE ACCESS PORT'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
