'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface CommissioningPort {
  readonly id: string;
  readonly name: string;
  readonly equipmentId: string;
  readonly equipmentName: string;
  readonly deviceId: string;
  readonly direction: 'INPUT' | 'OUTPUT' | 'BIDIRECTIONAL';
  readonly feed?: 'A' | 'B';
  readonly connected?: boolean;
}

export function ConnectEquipmentPowerForm({
  sources,
  targets,
  selectedSourceId,
  selectedTargetId,
  returnHref,
}: Readonly<{
  sources: readonly CommissioningPort[];
  targets: readonly CommissioningPort[];
  selectedSourceId?: string;
  selectedTargetId?: string;
  returnHref: string;
}>) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(selectedSourceId ?? '');
  const [targetId, setTargetId] = useState(selectedTargetId ?? '');
  const [search, setSearch] = useState('');
  const [feed, setFeed] = useState<'A' | 'B'>('A');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const source = sources.find((port) => port.id === sourceId);
  const target = targets.find((port) => port.id === targetId);
  const chosenFeed = source?.feed ?? target?.feed ?? feed;
  const mismatch = Boolean(source?.feed && target?.feed && source.feed !== target.feed);
  const sourceAndTargetSameEquipment = Boolean(source && target && source.equipmentId === target.equipmentId);
  const canConfirm = Boolean(
    source && target && !target.connected && !mismatch && !sourceAndTargetSameEquipment && !saving,
  );

  const filteredTargets = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return targets;
    return targets.filter((port) =>
      [port.equipmentName, port.name, port.id, port.deviceId]
        .some((value) => value.toLowerCase().includes(text)),
    );
  }, [search, targets]);

  async function confirm() {
    if (!canConfirm || !source || !target) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/power-paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceAccessPortId: source.id,
          targetAccessPortId: target.id,
          feed: chosenFeed,
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        path?: { id: string };
        error?: string;
      } | null;
      if (!response.ok || !result?.path?.id) {
        setError(result?.error ?? `CONNECT_FAILED_${response.status}`);
        return;
      }
      router.push(
        `/power?path=${encodeURIComponent(result.path.id)}&feed=${chosenFeed}`,
      );
      router.refresh();
    } catch {
      setError('NETWORK_ERROR: Connection could not be confirmed. Nothing was recorded.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="power-port-connect-page">
      <header className="power-port-connect-header">
        <div>
          <small>POWER / PHYSICAL COMMISSIONING</small>
          <h1>Connect Equipment Power</h1>
          <p>Link a real POWER OUTPUT terminal to a real POWER INPUT terminal.</p>
        </div>
        <Link href={returnHref}>← BACK TO EQUIPMENT</Link>
      </header>

      <div className="power-port-connect-columns">
        <section className="power-port-connect-panel">
          <h2>1 · Electrical source</h2>
          <p>Choose the Circuit Breaker output or other authorized POWER source.</p>
          <label>
            Source Equipment / POWER OUTPUT
            <select
              value={sourceId}
              onChange={(event) => { setSourceId(event.target.value); setError(''); }}
            >
              <option value="">Select source port</option>
              {sources.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.equipmentName} / {port.name}{port.feed ? ` · Feed ${port.feed}` : ''}
                </option>
              ))}
            </select>
          </label>
          {source && (
            <div className="power-port-connect-preview">
              <small>SELECTED SOURCE</small>
              <strong>{source.equipmentName}</strong>
              <span>{source.name} · {source.direction}</span>
            </div>
          )}
        </section>

        <section className="power-port-connect-panel">
          <h2>2 · Destination load</h2>
          <p>Select the Switch POWER input that is physically fed by this source.</p>
          <label>
            Search destination Equipment
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="SWITCH-01, Power input, rack..."
            />
          </label>
          <label>
            Destination Equipment / POWER INPUT
            <select
              value={targetId}
              onChange={(event) => { setTargetId(event.target.value); setError(''); }}
            >
              <option value="">Select destination port</option>
              {filteredTargets.map((port) => (
                <option key={port.id} value={port.id} disabled={port.connected}>
                  {port.equipmentName} / {port.name}
                  {port.feed ? ` · Feed ${port.feed}` : ''}
                  {port.connected ? ' · ALREADY CONNECTED' : ''}
                </option>
              ))}
              {target && !filteredTargets.some((port) => port.id === target.id) && (
                <option value={target.id}>{target.equipmentName} / {target.name}</option>
              )}
            </select>
          </label>
          {target && (
            <div className="power-port-connect-preview">
              <small>SELECTED DESTINATION</small>
              <strong>{target.equipmentName}</strong>
              <span>{target.name} · {target.direction}</span>
            </div>
          )}
        </section>
      </div>

      <section className="power-port-connect-review">
        <h2>3 · Verify and confirm the physical connection</h2>
        <div className="power-port-connect-path">
          <strong>{source ? `${source.equipmentName} / ${source.name}` : 'Select source'}</strong>
          <span aria-hidden="true">→</span>
          <strong>{target ? `${target.equipmentName} / ${target.name}` : 'Select destination'}</strong>
        </div>
        <div className="power-port-connect-fields">
          <label>
            Electrical feed
            <select
              value={chosenFeed}
              disabled={Boolean(source?.feed || target?.feed)}
              onChange={(event) => setFeed(event.target.value as 'A' | 'B')}
            >
              <option value="A">Feed A</option>
              <option value="B">Feed B</option>
            </select>
          </label>
          <label>
            Connection label (optional)
            <input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} placeholder="BDFB Panel A1 → Switch input" />
          </label>
        </div>
        {sourceAndTargetSameEquipment && <p role="alert">Source and destination must be different Equipment.</p>}
        {target?.connected && <p role="alert">That POWER INPUT is already connected.</p>}
        {mismatch && <p role="alert">FEED_MISMATCH: Source and destination have different fixed feeds.</p>}
        {error && <p role="alert">{error}</p>}
        <p className="power-port-connect-caution">
          Confirmation records a real PowerPath. Verify the electrical connection on site first;
          this action does not energize hardware or simulate telemetry.
        </p>
        <div className="power-port-connect-actions">
          <Link href={returnHref}>Cancel</Link>
          <button type="button" disabled={!canConfirm} onClick={() => void confirm()}>
            {saving ? 'CONFIRMING…' : 'CONFIRM PHYSICAL CONNECTION'}
          </button>
        </div>
      </section>
    </main>
  );
}
