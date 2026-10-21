'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

interface BindingRow {
  id: string;
  sourceIdentity: string;
  oid: string;
  metric: string;
  commissionedAt: string;
}
interface FeedRow {
  id: string;
  equipmentId: string;
  name: string;
  side: string | null;
  feedPosition: string | null;
  ratedCurrentA: number | null;
  independentInputConfirmed: boolean;
  servedPanelIds: string[];
  bindings: BindingRow[];
}
interface Configuration {
  deviceId: string;
  hardwareProfile: string | null;
  canCommission: boolean;
  ports: FeedRow[];
}

export function SnmpFeedCommissioning({
  deviceId,
  chassisId,
}: {
  deviceId: string;
  chassisId: string;
}) {
  const [show, setShow] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [currentOid, setCurrentOid] = useState('');
  const [voltageOid, setVoltageOid] = useState('');
  const [selectedPort, setSelectedPort] = useState('');
  const [confirmPhysicalMapping, setConfirmPhysicalMapping] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      const result = await fetch(
        '/api/telemetry/snmp/commission?' + new URLSearchParams({ deviceId }),
        { cache: 'no-store' },
      );
      const body = await result.json();
      if (!result.ok) throw new Error(body.error ?? 'SNMP_CONFIGURATION_UNAVAILABLE');
      setConfiguration(body as Configuration);
      setSelectedPort((old) => old || (body.ports[0]?.id ?? ''));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SNMP_CONFIGURATION_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }
  async function activateProfile(profile: 'ELTEK_BDCBB_CONFIG_2' | 'ELTEK_BDCBB_CONFIG_4') {
    if (
      !window.confirm(
        `Confirm the installed ${profile} wiring. Config 2 = two A/B shunts for linked panels; Config 4 = four A1/A2/B1/B2 shunts. Lab configuration is not field certification. Retire existing SNMP bindings before switching.`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await fetch('/api/telemetry/snmp/hardware-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          hardwareProfile: profile,
          confirmInstalledProfile: true,
        }),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? 'PROFILE_ASSIGNMENT_FAILED');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PROFILE_ASSIGNMENT_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function commission(event: FormEvent) {
    event.preventDefault();
    if (!confirmPhysicalMapping || !selectedPort) return;
    setBusy(true);
    try {
      const configured = [
        { metric: 'CURRENT', oid: currentOid.trim() },
        ...(voltageOid.trim() ? [{ metric: 'VOLTAGE', oid: voltageOid.trim() }] : []),
      ];
      for (const entry of configured) {
        const response = await fetch('/api/telemetry/snmp/commission', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            feedAccessPortId: selectedPort,
            sourceIdentity: sourceIdentity.trim(),
            ...entry,
            confirmPhysicalMapping: true,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'COMMISSIONING_FAILED');
      }
      setCurrentOid('');
      setVoltageOid('');
      setConfirmPhysicalMapping(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'COMMISSIONING_FAILED');
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function retire(portId: string, binding: BindingRow) {
    if (
      !window.confirm(
        `Retire ${binding.metric} / ${binding.oid} from this feed? Its historical observations remain stored.`,
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch('/api/telemetry/snmp/commission', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          feedAccessPortId: portId,
          bindingId: binding.id,
          confirmRetirement: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'RETIRE_FAILED');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RETIRE_FAILED');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="zip-bdfb-live-average" aria-label="SNMP feeder commissioning">
      <header>
        <strong>SNMP FEED COMMISSIONING</strong>
        <button
          type="button"
          onClick={() => {
            if (!show) void refresh();
            setShow(!show);
          }}
        >
          {show ? 'CLOSE' : 'CONFIGURE'}
        </button>
      </header>
      {show && (
        <>
          <p>
            Assign the actual SNMP agent and OID to an inventoried BDFB POWER INPUT feeder.
            Credentials stay in the Collector environment, never in this browser.
          </p>
          {configuration?.canCommission && (
            <p>
              Physical profile: {configuration.hardwareProfile ?? 'NOT SELECTED'}.
              <button type="button" disabled={busy} onClick={() => void activateProfile('ELTEK_BDCBB_CONFIG_2')}>
                SELECT CONFIGURATION 2 · SHUNTS A / B
              </button>
              <button type="button" disabled={busy} onClick={() => void activateProfile('ELTEK_BDCBB_CONFIG_4')}>
                SELECT CONFIGURATION 4 · A1 / A2 / B1 / B2
              </button>
            </p>
          )}
          <p>
            <Link href={`/device/${encodeURIComponent(chassisId)}`}>
              Configure physical input ports on the chassis →
            </Link>
          </p>
          {loading && <small>Loading commissioning inventory…</small>}
          {configuration?.ports.map((port) => (
            <article key={port.id} className="zip-bdfb-live-average-counts">
              <strong>
                {port.name} · {port.feedPosition ?? port.side ?? 'Unassigned input'}
              </strong>
              <span>
                {port.independentInputConfirmed
                  ? 'Independent shunt confirmed'
                  : 'Independence unverified — excluded from totals'}
              </span>
              <small>
                Capacity: {port.ratedCurrentA ?? 'Unknown'} A · Panels:{' '}
                {port.servedPanelIds.join(', ') || 'Unverified'}
              </small>
              {port.bindings.map((binding) => (
                <div key={binding.id}>
                  <small>
                    {binding.metric} · {binding.sourceIdentity} · {binding.oid}
                  </small>
                  {configuration.canCommission && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void retire(port.id, binding)}
                    >
                      RETIRE MAPPING
                    </button>
                  )}
                </div>
              ))}
            </article>
          ))}
          {configuration?.canCommission && (
            <form
              onSubmit={(event) => void commission(event)}
              className="equipment-access-port-form"
            >
              <label>
                Physical input feeder
                <select
                  required
                  value={selectedPort}
                  onChange={(event) => setSelectedPort(event.target.value)}
                >
                  {configuration.ports.map((port) => (
                    <option key={port.id} value={port.id}>
                      {port.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stable controller/source identity
                <input
                  required
                  maxLength={120}
                  value={sourceIdentity}
                  onChange={(event) => setSourceIdentity(event.target.value)}
                  placeholder="EMU-DELTA-BFDB-01"
                />
              </label>
              <label>
                Current OID (A)
                <input
                  required
                  value={currentOid}
                  onChange={(event) => setCurrentOid(event.target.value)}
                  placeholder="1.3.6.1....0"
                />
              </label>
              <label>
                Voltage OID (optional, V)
                <input
                  value={voltageOid}
                  onChange={(event) => setVoltageOid(event.target.value)}
                  placeholder="1.3.6.1....0"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmPhysicalMapping}
                  onChange={(event) => setConfirmPhysicalMapping(event.target.checked)}
                />
                I verified this controller, OID, shunt and incoming feeder with the wiring schedule
              </label>
              <button type="submit" disabled={busy || !selectedPort || !confirmPhysicalMapping}>
                {busy ? 'SAVING…' : 'COMMISSION VERIFIED OID'}
              </button>
            </form>
          )}
          {!configuration?.ports.length && !loading && (
            <small>First create a SNMP BDFB input feed AccessPort on the chassis.</small>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button type="button" onClick={() => void refresh()} disabled={busy}>
            REFRESH COMMISSIONING
          </button>
        </>
      )}
    </section>
  );
}
