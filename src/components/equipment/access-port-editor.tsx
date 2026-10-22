'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type { PortConnectionView } from '@/modules/power/domain/port-connection-view';
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
  feedPosition: '' | 'A1' | 'A2' | 'B1' | 'B2';
  overloadThresholdA: string;
  snmpFeedInput: boolean;
  independentInputConfirmed: boolean;
  ratedCurrentA: string;
  shuntRatedCurrentA: string;
  shuntRatedMillivolts: string;
  servedPanelIds: string[];
}

interface BdfbPanelOption {
  id: string;
  name: string;
  frameName: string;
  assignedPortId?: string;
  assignedPortName?: string;
}

interface BdfbPanelInventory {
  hardwareProfile: 'ELTEK_BDCBB_CONFIG_2' | 'ELTEK_BDCBB_CONFIG_4' | null;
  panels: BdfbPanelOption[];
}

const types: readonly AccessPortType[] = [
  'POWER',
  'NETWORK',
  'CONTROL',
  'DATA',
  'GROUND',
  'CUSTOM',
];
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
    feedPosition: ['A1', 'A2', 'B1', 'B2'].includes(String(port?.attributes?.feedPosition))
      ? (port?.attributes?.feedPosition as PortForm['feedPosition'])
      : '',
    overloadThresholdA:
      typeof port?.attributes?.overloadThresholdA === 'number'
        ? String(port.attributes.overloadThresholdA)
        : '',
    snmpFeedInput: port?.attributes?.snmpFeedInput === true,
    independentInputConfirmed: port?.attributes?.independentInputConfirmed === true,
    ratedCurrentA:
      typeof port?.attributes?.ratedCurrentA === 'number'
        ? String(port.attributes.ratedCurrentA)
        : '',
    shuntRatedCurrentA:
      typeof port?.attributes?.shuntRatedCurrentA === 'number'
        ? String(port.attributes.shuntRatedCurrentA)
        : '',
    shuntRatedMillivolts:
      typeof port?.attributes?.shuntRatedMillivolts === 'number'
        ? String(port.attributes.shuntRatedMillivolts)
        : '',
    servedPanelIds: Array.isArray(port?.attributes?.servedPanelIds)
      ? port.attributes.servedPanelIds.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

export function AccessPortEditor({
  equipmentId,
  accessPorts,
  canWritePower,
  portConnections = [],
}: Readonly<{
  equipmentId: string;
  accessPorts: readonly AccessPort[];
  canWritePower: boolean;
  portConnections?: readonly PortConnectionView[];
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PortForm>(() => formFor());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panels, setPanels] = useState<BdfbPanelOption[]>([]);
  const [hardwareProfile, setHardwareProfile] = useState<BdfbPanelInventory['hardwareProfile']>(null);
  const [panelsLoading, setPanelsLoading] = useState(false);
  const [panelsError, setPanelsError] = useState('');
  const [panelSearch, setPanelSearch] = useState('');

  const maxPanelCount = hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'
    ? 1 : hardwareProfile === 'ELTEK_BDCBB_CONFIG_2' ? 2 : 24;
  const visiblePanels = panels.filter((panel) =>
    `${panel.name} ${panel.frameName}`.toLocaleLowerCase()
      .includes(panelSearch.trim().toLocaleLowerCase()),
  );
  const panelSelectionHasConflict = form.servedPanelIds.some((id) => {
    const panel = panels.find((item) => item.id === id);
    return !panel || Boolean(panel.assignedPortId && panel.assignedPortId !== editingId);
  });
  const snmpNeedsPanels =
    form.portType === 'POWER' &&
    form.direction === 'INPUT' &&
    form.exposure === 'EXTERNAL' &&
    form.snmpFeedInput;

  const active = accessPorts.filter((port) => port.lifecycle === 'ACTIVE');
  const editing = active.find((port) => port.id === editingId);
  const canSave =
    form.name.trim().length > 0 &&
    !busy &&
    (!snmpNeedsPanels || (!panelsLoading && !panelsError && !panelSelectionHasConflict && form.servedPanelIds.length <= maxPanelCount)) &&
    (canWritePower || (form.portType !== 'POWER' && editing?.portType !== 'POWER'));

  function patch(change: Partial<PortForm>) {
    setForm((previous) => ({ ...previous, ...change }));
  }

  async function loadPanels() {
    setPanelsLoading(true);
    setPanelsError('');
    try {
      const response = await fetch(
        `/api/equipment/${encodeURIComponent(equipmentId)}/available-panels`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as BdfbPanelInventory & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'PANEL_INVENTORY_UNAVAILABLE');
      setPanels(data.panels);
      setHardwareProfile(data.hardwareProfile);
    } catch (cause) {
      setPanels([]);
      setPanelsError(cause instanceof Error ? cause.message : 'PANEL_INVENTORY_UNAVAILABLE');
    } finally {
      setPanelsLoading(false);
    }
  }

  function togglePanel(id: string) {
    setForm((previous) => ({
      ...previous,
      servedPanelIds: previous.servedPanelIds.includes(id)
        ? previous.servedPanelIds.filter((value) => value !== id)
        : previous.servedPanelIds.length < maxPanelCount
          ? [...previous.servedPanelIds, id]
          : previous.servedPanelIds,
    }));
  }

  function reset(port?: AccessPort) {
    setEditingId(port?.id ?? null);
    setForm(formFor(port));
    setPanelSearch('');
    setError('');
  }

  function openEditor(port?: AccessPort) {
    reset(port);
    setOpen(true);
    void loadPanels();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/equipment/${encodeURIComponent(equipmentId)}/access-ports`,
        {
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
              ...(form.portType === 'POWER' &&
              form.direction === 'INPUT' &&
              form.exposure === 'EXTERNAL'
                ? {
                    snmpFeedInput: form.snmpFeedInput,
                    ...(form.snmpFeedInput && form.feedPosition
                      ? { feedPosition: form.feedPosition }
                      : {}),
                    ...(form.snmpFeedInput && form.overloadThresholdA
                      ? { overloadThresholdA: Number(form.overloadThresholdA) }
                      : {}),
                    independentInputConfirmed: form.snmpFeedInput && form.independentInputConfirmed,
                    ...(form.snmpFeedInput && form.ratedCurrentA
                      ? { ratedCurrentA: Number(form.ratedCurrentA) }
                      : {}),
                    ...(form.snmpFeedInput && form.shuntRatedCurrentA
                      ? { shuntRatedCurrentA: Number(form.shuntRatedCurrentA) }
                      : {}),
                    ...(form.snmpFeedInput && form.shuntRatedMillivolts
                      ? { shuntRatedMillivolts: Number(form.shuntRatedMillivolts) }
                      : {}),
                    ...(form.snmpFeedInput
                      ? {
                          servedPanelIds: form.servedPanelIds,
                        }
                      : {}),
                  }
                : {}),
            },
          }),
        },
      );
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
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Archive port "${port.name}"? Connected ports cannot be archived.`)
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/equipment/${encodeURIComponent(equipmentId)}/access-ports`,
        {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ portId: port.id }),
        },
      );
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
              <small>
                {port.portType} · {port.direction ?? 'UNSPECIFIED'} · {port.exposure}
              </small>
              {(port.connectorType || port.protocol) && (
                <small>{[port.connectorType, port.protocol].filter(Boolean).join(' · ')}</small>
              )}
            </div>
            <div>
              {portConnections
                .filter((connection) => connection.portId === port.id)
                .map((connection) => (
                  <div className="equipment-terminal-connection" key={connection.pathId}>
                    <strong>
                      CONNECTED · {connection.flow === 'OUTGOING' ? 'FEEDS' : 'POWERED BY'}
                    </strong>
                    <span>
                      {connection.peerEquipmentName} / {connection.peerPortName}
                    </span>
                    <Link href={`/power?path=${encodeURIComponent(connection.pathId)}`}>
                      VIEW POWERPATH
                    </Link>
                  </div>
                ))}
              {canWritePower &&
                port.portType === 'POWER' &&
                !portConnections.some((connection) => connection.portId === port.id) && (
                  <Link
                    className="equipment-access-port-connect"
                    href={`/power/connect/equipment?${port.direction === 'INPUT' ? 'target' : 'source'}=${encodeURIComponent(port.id)}`}
                  >
                    {port.direction === 'INPUT' ? 'CONNECT SOURCE' : 'CONNECT LOAD'}
                  </Link>
                )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  openEditor(port);
                }}
              >
                EDIT
              </button>
              <button
                type="button"
                disabled={busy || (!canWritePower && port.portType === 'POWER')}
                onClick={() => void archive(port)}
              >
                ARCHIVE
              </button>
            </div>
          </article>
        ))}
      </div>
      <button type="button" onClick={() => openEditor()}>
        + ADD ACCESS PORT
      </button>
      {error && !open && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {open && (
        <div
          className="power-contract-backdrop"
          role="presentation"
          onMouseDown={() => !busy && setOpen(false)}
        >
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
                <h2 id="access-port-dialog-title">
                  {editingId ? 'Edit Access Port' : 'Add Access Port'}
                </h2>
                <p>
                  Configure the physical terminal on this Equipment. Connections are managed
                  separately.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label="Close Access Port editor"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <form onSubmit={(event) => void save(event)} className="equipment-access-port-form">
              <label>
                Name
                <input
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </label>
              <label>
                Port type
                <select
                  value={form.portType}
                  onChange={(event) =>
                    patch({ portType: event.target.value as AccessPortType, feed: '' })
                  }
                >
                  {types.map((type) => (
                    <option key={type} value={type} disabled={type === 'POWER' && !canWritePower}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direction
                <select
                  value={form.direction}
                  onChange={(event) =>
                    patch({ direction: event.target.value as AccessPortDirection })
                  }
                >
                  {directions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Exposure
                <select
                  value={form.exposure}
                  onChange={(event) =>
                    patch({ exposure: event.target.value as AccessPortExposure })
                  }
                >
                  {exposures.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Connector
                <input
                  maxLength={120}
                  value={form.connectorType}
                  onChange={(event) => patch({ connectorType: event.target.value })}
                  placeholder="RJ45, SFP+, terminal..."
                />
              </label>
              <label>
                Protocol
                <input
                  maxLength={120}
                  value={form.protocol}
                  onChange={(event) => patch({ protocol: event.target.value })}
                  placeholder="Ethernet, Modbus, RS-485..."
                />
              </label>
              {form.portType === 'CUSTOM' && (
                <label>
                  Custom type
                  <input
                    maxLength={120}
                    value={form.customType}
                    onChange={(event) => patch({ customType: event.target.value })}
                  />
                </label>
              )}
              {form.portType === 'POWER' && (
                <label>
                  Feed
                  <select
                    value={form.feed}
                    onChange={(event) => patch({ feed: event.target.value as PortForm['feed'] })}
                  >
                    <option value="">Not assigned</option>
                    <option value="A">Feed A</option>
                    <option value="B">Feed B</option>
                  </select>
                </label>
              )}
              {form.portType === 'POWER' &&
                form.direction === 'INPUT' &&
                form.exposure === 'EXTERNAL' && (
                  <fieldset className="equipment-access-port-snmp">
                    <legend>SNMP DC input feeder (BDFB only)</legend>
                    <label className="equipment-access-port-check">
                      <input
                        type="checkbox"
                        checked={form.snmpFeedInput}
                        onChange={(event) =>
                          patch({
                            snmpFeedInput: event.target.checked,
                            independentInputConfirmed: false,
                          })
                        }
                      />
                      This port is a physically inventoried incoming BDFB feed
                    </label>
                    {form.snmpFeedInput && (
                      <>
                        {hardwareProfile !== 'ELTEK_BDCBB_CONFIG_2' && <label>
                          Independent incoming feeder position (Configuration 4)
                          <select
                            value={form.feedPosition}
                            onChange={(event) =>
                              patch({
                                feedPosition: event.target.value as PortForm['feedPosition'],
                                feed: event.target.value
                                  ? (event.target.value[0] as PortForm['feed'])
                                  : form.feed,
                              })
                            }
                          >
                            <option value="">Generic / unverified</option>
                            <option value="A1">A1 · side A</option>
                            <option value="A2">A2 · side A</option>
                            <option value="B1">B1 · side B</option>
                            <option value="B2">B2 · side B</option>
                          </select>
                        </label>}
                        <label>
                          Overload warning threshold (A) · manufacturer default 640 A
                          <input
                            type="number"
                            min="0.01"
                            max="100000"
                            step="any"
                            value={form.overloadThresholdA}
                            onChange={(event) => patch({ overloadThresholdA: event.target.value })}
                          />
                        </label>
                        <label>
                          Nominal feed rating (A)
                          <input
                            type="number"
                            min="0.01"
                            max="100000"
                            step="any"
                            value={form.ratedCurrentA}
                            onChange={(event) => patch({ ratedCurrentA: event.target.value })}
                          />
                        </label>
                        <label>
                          Shunt rated current (A)
                          <input
                            type="number"
                            min="0.01"
                            max="100000"
                            step="any"
                            value={form.shuntRatedCurrentA}
                            onChange={(event) => patch({ shuntRatedCurrentA: event.target.value })}
                          />
                        </label>
                        <label>
                          Shunt rated millivolts (mV)
                          <input
                            type="number"
                            min="0.01"
                            max="100000"
                            step="any"
                            value={form.shuntRatedMillivolts}
                            onChange={(event) =>
                              patch({ shuntRatedMillivolts: event.target.value })
                            }
                          />
                        </label>
                        <div className="equipment-panel-picker">
                          <div className="equipment-panel-picker-title">
                            <strong>Supplied physical panels</strong>
                            <span>{form.servedPanelIds.length} / {maxPanelCount} selected</span>
                          </div>
                          <p className="equipment-panel-picker-help">
                            Choose installed PANEL equipment from this BDFB. IDs are assigned automatically.
                          </p>
                          <input
                            type="search"
                            className="equipment-panel-picker-search"
                            value={panelSearch}
                            onChange={(event) => setPanelSearch(event.target.value)}
                            placeholder="Search panels or frame…"
                            aria-label="Search available BDFB panels"
                            disabled={panelsLoading || Boolean(panelsError)}
                          />
                          {panelsLoading && <span role="status">Loading panels from inventory…</span>}
                          {panelsError && (
                            <div role="alert" className="form-error">
                              Could not load panel inventory: {panelsError}{' '}
                              <button type="button" onClick={() => void loadPanels()}>Retry</button>
                            </div>
                          )}
                          {!panelsLoading && !panelsError && (
                            <div className="equipment-panel-picker-options" role="group" aria-label="Physical BDFB panels">
                              {visiblePanels.length === 0 && (
                                <p className="equipment-panel-picker-empty">
                                  {panels.length === 0
                                    ? 'No PANEL equipment on this BDFB. Install panels in the FRAME first.'
                                    : 'No matching panels.'}
                                </p>
                              )}
                              {visiblePanels.map((panel) => {
                                const selected = form.servedPanelIds.includes(panel.id);
                                const claimed = Boolean(panel.assignedPortId && panel.assignedPortId !== editingId);
                                return (
                                  <label key={panel.id} className="equipment-panel-picker-option">
                                    <input
                                      type="checkbox"
                                      aria-label={`Assign ${panel.name}`}
                                      checked={selected}
                                      disabled={claimed || (!selected && form.servedPanelIds.length >= maxPanelCount)}
                                      onChange={() => togglePanel(panel.id)}
                                    />
                                    <span>
                                      <strong>{panel.name}</strong>
                                      <small>{panel.frameName}</small>
                                      {claimed && <small>Assigned to {panel.assignedPortName}</small>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {hardwareProfile === 'ELTEK_BDCBB_CONFIG_2' && (
                            <p className="equipment-panel-picker-help">
                              Config 2: each independent A/B shunt supplies two linked panels.
                            </p>
                          )}
                          {hardwareProfile === 'ELTEK_BDCBB_CONFIG_4' && (
                            <p className="equipment-panel-picker-help">
                              Config 4: one independent shunt supplies one panel.
                            </p>
                          )}
                        </div>
                        <label className="equipment-access-port-check">
                          <input
                            type="checkbox"
                            checked={form.independentInputConfirmed}
                            onChange={(event) =>
                              patch({ independentInputConfirmed: event.target.checked })
                            }
                          />
                          Wiring verified: this shunt is independent, not a duplicate upstream/bus
                          measurement
                        </label>
                        <small>
                          This controls whether currents can contribute to the certified BDFB total.
                          A/B are sides, not unique feed identities. Do not infer panel loads.
                        </small>
                      </>
                    )}
                  </fieldset>
                )}
              <p>
                Archiving or changing the electrical identity of a connected terminal is blocked.
                Power Paths remain authoritative.
              </p>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <footer>
                <button type="button" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={!canSave}>
                  {busy ? 'Saving…' : 'SAVE ACCESS PORT'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
