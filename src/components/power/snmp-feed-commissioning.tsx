'use client';

import Link from 'next/link';
import { useState } from 'react';

interface BindingRow {
  id: string;
  sourceIdentity: string;
  oid: string;
  metric: string;
}
interface FeedRow {
  id: string;
  name: string;
  side: string | null;
  feedPosition: string | null;
  bindings: BindingRow[];
}
interface Configuration {
  hardwareProfile: string | null;
  canCommission: boolean;
  ports: FeedRow[];
}

/**
 * The CHASSIS AccessPort editor is the single canonical flow for BDFB shunt
 * inventory, physical verification and SNMP OID commissioning.
 *
 * The inspector only displays a concise link plus optional maintenance tasks
 * (profile switching and retiring historical bindings). No second competing
 * SNMP commissioning form lives inside the narrow telemetry inspector.
 */
export function SnmpFeedCommissioning({
  deviceId,
  chassisId,
  onInventoryChanged,
}: {
  deviceId: string;
  chassisId: string;
  onInventoryChanged?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const result = await fetch(
        '/api/telemetry/snmp/commission?' + new URLSearchParams({ deviceId }),
        { cache: 'no-store' },
      );
      const body = (await result.json()) as Configuration & { error?: string };
      if (!result.ok) throw new Error(body.error ?? 'SNMP_CONFIGURATION_UNAVAILABLE');
      setConfiguration(body);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SNMP_CONFIGURATION_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }

  async function activateProfile(profile: 'ELTEK_BDCBB_CONFIG_2' | 'ELTEK_BDCBB_CONFIG_4') {
    if (configuration?.hardwareProfile === profile) return;
    if (
      !window.confirm(
        `Confirm that the installed physical wiring uses ${profile}. This changes the expected shunt configuration. Previously commissioned SNMP bindings must be retired before switching.`,
      )
    ) return;
    setBusy(true);
    try {
      const response = await fetch('/api/telemetry/snmp/hardware-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, hardwareProfile: profile, confirmInstalledProfile: true }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'PROFILE_ASSIGNMENT_FAILED');
      await refresh();
      onInventoryChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PROFILE_ASSIGNMENT_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function retire(portId: string, binding: BindingRow) {
    if (!window.confirm(`Retire the ${binding.metric} mapping? Existing historical samples remain stored.`))
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
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'RETIRE_FAILED');
      await refresh();
      onInventoryChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RETIRE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="zip-bdfb-live-average sm-snmp-setup" aria-label="SNMP feeder configuration">
      <header>
        <strong>CONFIGURE SNMP INPUTS</strong>
      </header>
      <p>
        Manage each shunt, verify its panel assignment and commission its OIDs in one editor.
      </p>
      <Link className="sm-snmp-setup-action" href={`/device/${encodeURIComponent(chassisId)}#bdfb-access-ports`}>
        OPEN DC INPUTS ON CHASSIS →
      </Link>
      <details
        className="sm-snmp-maintenance"
        open={expanded}
        onToggle={(event) => {
          const isOpen = event.currentTarget.open;
          setExpanded(isOpen);
          if (isOpen) void refresh();
        }}
      >
        <summary>Advanced maintenance · hardware profile and retired OIDs</summary>
        {loading && <p role="status">Loading SNMP inventory…</p>}
        {configuration && (
          <>
            <p>Hardware profile: <strong>{configuration.hardwareProfile ?? 'Not selected'}</strong></p>
            {configuration.canCommission && (
              <div className="sm-snmp-maintenance-actions">
                <button type="button" disabled={busy || loading || configuration.hardwareProfile === 'ELTEK_BDCBB_CONFIG_2'} onClick={() => void activateProfile('ELTEK_BDCBB_CONFIG_2')}>
                  USE CONFIG 2
                </button>
                <button type="button" disabled={busy || loading || configuration.hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'} onClick={() => void activateProfile('ELTEK_BDCBB_CONFIG_4')}>
                  USE CONFIG 4
                </button>
              </div>
            )}
            {configuration.ports.map((port) => (
              <div key={port.id} className="sm-snmp-maintenance-port">
                <strong>{port.name}</strong>
                {port.bindings.length === 0 && <small>No commissioned OIDs</small>}
                {port.bindings.map((binding) => (
                  <div key={binding.id} className="sm-snmp-maintenance-binding">
                    <small>
                      {binding.metric} · {binding.sourceIdentity}
                      <span>{binding.oid}</span>
                    </small>
                    {configuration.canCommission && (
                      <button type="button" disabled={busy} onClick={() => void retire(port.id, binding)}>
                        RETIRE
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        {error && <p role="alert" className="form-error">{error}</p>}
      </details>
    </section>
  );
}
