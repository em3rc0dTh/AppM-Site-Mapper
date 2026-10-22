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
  equipmentType: string;
  deviceId: string;
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
  const [hardwareProfile, setHardwareProfile] =
    useState<BdfbPanelInventory['hardwareProfile']>(null);
  const [panelsLoading, setPanelsLoading] = useState(false);
  const [panelsError, setPanelsError] = useState('');
  const [panelSearch, setPanelSearch] = useState('');
  const [bdfbChassis, setBdfbChassis] = useState(false);
  const [genericPortMode, setGenericPortMode] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [mapSnmpNow, setMapSnmpNow] = useState(false);
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [currentOid, setCurrentOid] = useState('');
  const [voltageOid, setVoltageOid] = useState('');
  const [confirmOidMapping, setConfirmOidMapping] = useState(false);
  const [existingSnmpBindings, setExistingSnmpBindings] = useState<
    { metric: string; oid: string; sourceIdentity: string }[]
  >([]);
  const [savedWithCommissionError, setSavedWithCommissionError] = useState(false);

  const maxPanelCount =
    hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'
      ? 1
      : hardwareProfile === 'ELTEK_BDCBB_CONFIG_2'
        ? 2
        : 24;
  const visiblePanels = panels.filter((panel) =>
    `${panel.name} ${panel.frameName}`
      .toLocaleLowerCase()
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
  const quickFeed = Boolean(
    bdfbChassis && !genericPortMode && hardwareProfile && snmpNeedsPanels && canWritePower,
  );

  const active = accessPorts.filter((port) => port.lifecycle === 'ACTIVE');
  const editing = active.find((port) => port.id === editingId);
  const hasCurrentMapping = existingSnmpBindings.some((binding) => binding.metric === 'CURRENT');
  const hasVoltageMapping = existingSnmpBindings.some((binding) => binding.metric === 'VOLTAGE');
  const commissioningRequested = quickFeed && mapSnmpNow;
  const commissionerReady = !commissioningRequested || (
    form.independentInputConfirmed && Boolean(sourceIdentity.trim()) &&
    (!hasCurrentMapping || Boolean(currentOid.trim())) &&
    (!hasVoltageMapping || Boolean(voltageOid.trim()) || hasCurrentMapping) &&
    confirmOidMapping &&
    (hardwareProfile !== 'ELTEK_BDCBB_CONFIG_4' ||
      (Number(form.ratedCurrentA) === 800 && Number(form.shuntRatedCurrentA) === 1000 &&
       Number(form.shuntRatedMillivolts) === 60))
  );
  const canSave =
    form.name.trim().length > 0 &&
    !busy &&
    commissionerReady &&
    (!snmpNeedsPanels ||
      (!panelsLoading &&
        !panelsError &&
        !panelSelectionHasConflict &&
        form.servedPanelIds.length <= maxPanelCount)) &&
    (!quickFeed ||
      (form.servedPanelIds.length === maxPanelCount &&
        (hardwareProfile === 'ELTEK_BDCBB_CONFIG_2'
          ? Boolean(form.feed)
          : Boolean(form.feedPosition)))) &&
    (canWritePower || (form.portType !== 'POWER' && editing?.portType !== 'POWER'));

  function patch(change: Partial<PortForm>) {
    setForm((previous) => ({ ...previous, ...change }));
  }

  async function loadPanels(port?: AccessPort) {
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
      setDeviceId(data.deviceId);
      setBdfbChassis(Boolean(data.hardwareProfile && data.equipmentType === 'CHASSIS'));
      if (port && data.hardwareProfile && data.equipmentType === 'CHASSIS') {
        const result = await fetch('/api/telemetry/snmp/commission?' +
          new URLSearchParams({ deviceId: data.deviceId }), { cache: 'no-store' });
        if (result.ok) {
          const commissioned = (await result.json()) as {
            ports: { id: string; bindings: { metric: string; oid: string; sourceIdentity: string }[] }[];
          };
          const matches = commissioned.ports.find((candidate) => candidate.id === port.id);
          if (matches) {
            setExistingSnmpBindings(matches.bindings);
            if (matches.bindings.length) setSourceIdentity(matches.bindings[0]!.sourceIdentity);
          }
        }
      }
      if (!port && data.hardwareProfile && data.equipmentType === 'CHASSIS') {
        setForm((previous) => ({
          ...previous,
          portType: 'POWER',
          direction: 'INPUT',
          exposure: 'EXTERNAL',
          snmpFeedInput: true,
          independentInputConfirmed: false,
          feed: '',
          feedPosition: '',
          servedPanelIds: [],
        }));
      }
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
    setHardwareProfile(null);
    setBdfbChassis(false);
    setGenericPortMode(false);
    setMapSnmpNow(false);
    setSourceIdentity('');
    setCurrentOid('');
    setVoltageOid('');
    setConfirmOidMapping(false);
    setExistingSnmpBindings([]);
    setSavedWithCommissionError(false);
    setDeviceId('');
    setError('');
  }

  function openEditor(port?: AccessPort) {
    reset(port);
    setOpen(true);
    void loadPanels(port);
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
      const result = (await response.json()) as { error?: string; port?: AccessPort };
      if (!response.ok) throw new Error(result.error ?? `SAVE_FAILED_${response.status}`);
      if (commissioningRequested && result.port) {
        // Port persistence and OID commissioning are distinct guarded API writes.
        // On partial failure keep the same editor open and the persisted port ID,
        // allowing a safe retry without creating a duplicate DC terminal.
        setEditingId(result.port.id);
        setSavedWithCommissionError(true);
        const mappings = [
          ...(!hasCurrentMapping ? [{ metric: 'CURRENT', oid: currentOid.trim() }] : []),
          ...(!hasVoltageMapping && voltageOid.trim()
            ? [{ metric: 'VOLTAGE', oid: voltageOid.trim() }] : []),
        ];
        for (const point of mappings) {
          const bindingResponse = await fetch('/api/telemetry/snmp/commission', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              deviceId,
              feedAccessPortId: result.port.id,
              sourceIdentity: sourceIdentity.trim(),
              ...point,
              confirmPhysicalMapping: true,
            }),
          });
          const bindingResult = (await bindingResponse.json()) as { error?: string };
          if (!bindingResponse.ok) {
            throw new Error('INPUT_SAVED_SNMP_MAPPING_INCOMPLETE: ' +
              (bindingResult.error ?? bindingResponse.status));
          }
          setExistingSnmpBindings((prior) => [...prior, {
            ...point, sourceIdentity: sourceIdentity.trim(),
          }]);
        }
        setSavedWithCommissionError(false);
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SAVE_FAILED');
      router.refresh();
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
                  {quickFeed
                    ? editingId
                      ? 'Edit DC input'
                      : 'Add DC input'
                    : editingId
                      ? 'Edit Access Port'
                      : 'Add Access Port'}
                </h2>
                <p>
                  {quickFeed
                    ? 'Select the shunt and its panels, verify the wiring, and optionally configure SNMP without leaving this window.'
                    : 'Configure the physical terminal on this Equipment. Connections are managed separately.'}
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
              {quickFeed && (
                <div className="equipment-quick-feed-summary">
                  <strong>
                    {hardwareProfile === 'ELTEK_BDCBB_CONFIG_2'
                      ? 'CONFIGURATION 2 · TWO SHUNTS (A / B)'
                      : 'CONFIGURATION 4 · FOUR SHUNTS (A1 / A2 / B1 / B2)'}
                  </strong>
                  <small>
                    POWER · INPUT · EXTERNAL · SNMP feeder are configured automatically.
                  </small>
                  {!editingId && (
                    <button
                      type="button"
                      className="equipment-quick-feed-generic"
                      onClick={() => {
                        setGenericPortMode(true);
                        setForm(formFor());
                      }}
                    >
                      Create a different port type
                    </button>
                  )}
                </div>
              )}
              {!quickFeed && (
                <>
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
                        <option
                          key={type}
                          value={type}
                          disabled={type === 'POWER' && !canWritePower}
                        >
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
                </>
              )}
              {form.portType === 'POWER' &&
                (!quickFeed || hardwareProfile === 'ELTEK_BDCBB_CONFIG_2') && (
                  <label>
                    {quickFeed ? 'Incoming shunt' : 'Feed'}
                    <select
                      value={form.feed}
                      onChange={(event) => {
                        const feed = event.target.value as PortForm['feed'];
                        patch({
                          feed,
                          ...(!editingId && quickFeed
                            ? { name: feed ? `INPUT-SHUNT-${feed}` : '' }
                            : {}),
                        });
                      }}
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
                    <legend>
                      {quickFeed
                        ? 'Panels supplied by this shunt'
                        : 'SNMP DC input feeder (BDFB only)'}
                    </legend>
                    {!quickFeed && (
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
                    )}
                    {form.snmpFeedInput && (
                      <>
                        {hardwareProfile !== 'ELTEK_BDCBB_CONFIG_2' && (
                          <label>
                            Independent incoming feeder position (Configuration 4)
                            <select
                              value={form.feedPosition}
                              onChange={(event) =>
                                patch({
                                  feedPosition: event.target.value as PortForm['feedPosition'],
                                  feed: event.target.value
                                    ? (event.target.value[0] as PortForm['feed'])
                                    : form.feed,
                                  ...(!editingId && quickFeed
                                    ? {
                                        name: event.target.value
                                          ? `INPUT-SHUNT-${event.target.value}`
                                          : '',
                                      }
                                    : {}),
                                })
                              }
                            >
                              <option value="">Generic / unverified</option>
                              <option value="A1">A1 · side A</option>
                              <option value="A2">A2 · side A</option>
                              <option value="B1">B1 · side B</option>
                              <option value="B2">B2 · side B</option>
                            </select>
                          </label>
                        )}
                        <div className="equipment-panel-picker">
                          <div className="equipment-panel-picker-title">
                            <strong>Supplied physical panels</strong>
                            <span>
                              {form.servedPanelIds.length} / {maxPanelCount} selected
                            </span>
                          </div>
                          <p className="equipment-panel-picker-help">
                            Choose installed PANEL equipment from this BDFB. IDs are assigned
                            automatically.
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
                          {panelsLoading && (
                            <span role="status">Loading panels from inventory…</span>
                          )}
                          {panelsError && (
                            <div role="alert" className="form-error">
                              Could not load panel inventory: {panelsError}{' '}
                              <button type="button" onClick={() => void loadPanels()}>
                                Retry
                              </button>
                            </div>
                          )}
                          {!panelsLoading && !panelsError && (
                            <div
                              className="equipment-panel-picker-options"
                              role="group"
                              aria-label="Physical BDFB panels"
                            >
                              {visiblePanels.length === 0 && (
                                <p className="equipment-panel-picker-empty">
                                  {panels.length === 0
                                    ? 'No PANEL equipment on this BDFB. Install panels in the FRAME first.'
                                    : 'No matching panels.'}
                                </p>
                              )}
                              {visiblePanels.map((panel) => {
                                const selected = form.servedPanelIds.includes(panel.id);
                                const claimed = Boolean(
                                  panel.assignedPortId && panel.assignedPortId !== editingId,
                                );
                                return (
                                  <label key={panel.id} className="equipment-panel-picker-option">
                                    <input
                                      type="checkbox"
                                      aria-label={`Assign ${panel.name}`}
                                      checked={selected}
                                      disabled={
                                        claimed ||
                                        (!selected && form.servedPanelIds.length >= maxPanelCount)
                                      }
                                      onChange={() => togglePanel(panel.id)}
                                    />
                                    <span>
                                      <strong>{panel.name}</strong>
                                      <small>{panel.frameName}</small>
                                      {claimed && (
                                        <small>Assigned to {panel.assignedPortName}</small>
                                      )}
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
                        <div className="equipment-dc-verification">
                          <strong>Physical verification</strong>
                          <label className="equipment-access-port-check">
                            <input
                              type="checkbox"
                              checked={form.independentInputConfirmed}
                              onChange={(event) => {
                                patch({ independentInputConfirmed: event.target.checked });
                                if (!event.target.checked) setMapSnmpNow(false);
                              }}
                            />
                            I confirmed from the cabinet wiring that this is a distinct incoming shunt, not a duplicated bus measurement.
                          </label>
                          <small>
                            {form.independentInputConfirmed
                              ? 'Physical mapping confirmed. You can configure SNMP below in this same window.'
                              : 'Not yet verified: save the inventory without certifying electrical totals or binding SNMP.'}
                          </small>
                        </div>
                        {quickFeed && (
                          <div className="equipment-dc-snmp-setup">
                            <strong>SNMP measurements</strong>
                            <label className="equipment-access-port-check">
                              <input
                                type="checkbox"
                                checked={mapSnmpNow}
                                disabled={!form.independentInputConfirmed || !deviceId}
                                onChange={(event) => setMapSnmpNow(event.target.checked)}
                              />
                              Configure OIDs for this input now
                            </label>
                            {!form.independentInputConfirmed && (
                              <small>To activate a real controller mapping, physical shunt verification is required. Lab emulation alone does not certify wiring.</small>
                            )}
                            {existingSnmpBindings.length > 0 && (
                              <div className="equipment-dc-existing-bindings" aria-label="Commissioned SNMP OIDs">
                                {existingSnmpBindings.map((item) => (
                                  <small key={item.metric}>{item.metric}: {item.oid} · {item.sourceIdentity}</small>
                                ))}
                              </div>
                            )}
                            {mapSnmpNow && (
                              <div className="equipment-dc-snmp-fields">
                                <label>
                                  Controller / source identity
                                  <input
                                    required
                                    maxLength={120}
                                    value={sourceIdentity}
                                    onChange={(event) => setSourceIdentity(event.target.value)}
                                    placeholder="Controller identity"
                                  />
                                </label>
                                {!hasCurrentMapping && (
                                  <label>
                                    Current OID · required
                                    <input
                                      required
                                      value={currentOid}
                                      onChange={(event) => setCurrentOid(event.target.value)}
                                      placeholder="1.3.6.1.…"
                                    />
                                  </label>
                                )}
                                {!hasVoltageMapping && (
                                  <label>
                                    Voltage OID · optional
                                    <input
                                      value={voltageOid}
                                      onChange={(event) => setVoltageOid(event.target.value)}
                                      placeholder="1.3.6.1.…"
                                    />
                                  </label>
                                )}
                                {hardwareProfile === 'ELTEK_BDCBB_CONFIG_4' &&
                                  (Number(form.ratedCurrentA) !== 800 ||
                                  Number(form.shuntRatedCurrentA) !== 1000 ||
                                  Number(form.shuntRatedMillivolts) !== 60) && (
                                    <p className="form-error">
                                      Config 4 requires verified 800 A input rating and 1000 A / 60 mV shunt values. Enter them under Equipment specifications below.
                                    </p>
                                  )}
                                <label className="equipment-access-port-check">
                                  <input
                                    type="checkbox"
                                    checked={confirmOidMapping}
                                    onChange={(event) => setConfirmOidMapping(event.target.checked)}
                                  />
                                  I verified the controller identity, OIDs, and their physical mapping. This is not inferred from the number of OIDs.
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                        <details className="equipment-access-port-advanced">
                          <summary>Optional equipment specifications · calibration & ratings</summary>
                          <p>
                            Leave unknown values empty; do not infer ratings from another BDFB.
                            Physical verification is required before commissioning SNMP OIDs or
                            claiming certified totals.
                          </p>
                          <div className="equipment-access-port-advanced-fields">
                            <label>
                              Overload warning threshold (A) · optional
                              <input
                                type="number"
                                min="0.01"
                                max="100000"
                                step="any"
                                value={form.overloadThresholdA}
                                onChange={(event) =>
                                  patch({ overloadThresholdA: event.target.value })
                                }
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
                                onChange={(event) =>
                                  patch({ shuntRatedCurrentA: event.target.value })
                                }
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


                          </div>
                        </details>
                      </>
                    )}
                  </fieldset>
                )}
              {!quickFeed && (
                <p>
                  Archiving or changing the electrical identity of a connected terminal is blocked.
                  Power Paths remain authoritative.
                </p>
              )}
              {quickFeed && (
                <p>
                  The physical verification box is explicit; measurements remain unverified if it is not checked.
                  {commissioningRequested && ' Saving also commissions the selected SNMP OIDs.'}
                </p>
              )}
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
                  {busy ? 'Saving…' : commissioningRequested ? 'SAVE INPUT + SNMP' : quickFeed ? 'SAVE DC INPUT' : 'SAVE ACCESS PORT'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
