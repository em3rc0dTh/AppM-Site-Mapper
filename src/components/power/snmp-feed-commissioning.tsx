'use client';

import { useTranslations } from 'next-intl';
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
  voltageToleranceV: number | null;
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
  const t = useTranslations('snmpSetup');
  const [expanded, setExpanded] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voltageToleranceInput, setVoltageToleranceInput] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const [result, profileResult] = await Promise.all([
        fetch('/api/telemetry/snmp/commission?' + new URLSearchParams({ deviceId }), {
          cache: 'no-store',
        }),
        fetch('/api/telemetry/snmp/hardware-profile?' + new URLSearchParams({ deviceId }), {
          cache: 'no-store',
        }),
      ]);
      const body = (await result.json()) as Configuration & { error?: string };
      const profileBody = (await profileResult.json()) as {
        error?: string;
        hardwareProfile?: string | null;
        voltageToleranceV?: number | null;
      };
      if (!result.ok) throw new Error(body.error ?? 'SNMP_CONFIGURATION_UNAVAILABLE');
      if (!profileResult.ok)
        throw new Error(profileBody.error ?? 'SNMP_PROFILE_CONFIGURATION_UNAVAILABLE');
      const voltageToleranceV = profileBody.voltageToleranceV ?? null;
      setConfiguration({
        ...body,
        hardwareProfile: profileBody.hardwareProfile ?? body.hardwareProfile,
        voltageToleranceV,
      });
      setVoltageToleranceInput(voltageToleranceV === null ? '' : String(voltageToleranceV));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SNMP_CONFIGURATION_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  }

  async function activateProfile(profile: 'ELTEK_BDCBB_CONFIG_2' | 'ELTEK_BDCBB_CONFIG_4') {
    if (configuration?.hardwareProfile === profile) return;
    if (!window.confirm(t('confirmProfile', { profile }))) return;
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

  async function saveVoltageTolerance() {
    if (
      configuration?.hardwareProfile !== 'ELTEK_BDCBB_CONFIG_2' &&
      configuration?.hardwareProfile !== 'ELTEK_BDCBB_CONFIG_4'
    )
      return;
    const voltageToleranceV = Number(voltageToleranceInput);
    if (!Number.isFinite(voltageToleranceV) || voltageToleranceV <= 0 || voltageToleranceV > 20) {
      setError(t('invalidVoltageTolerance'));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/telemetry/snmp/hardware-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          hardwareProfile: configuration.hardwareProfile,
          voltageToleranceV,
          confirmInstalledProfile: true,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'VOLTAGE_TOLERANCE_UPDATE_FAILED');
      await refresh();
      onInventoryChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'VOLTAGE_TOLERANCE_UPDATE_FAILED');
    } finally {
      setBusy(false);
    }
  }

  async function retire(portId: string, binding: BindingRow) {
    if (!window.confirm(t('confirmRetire', { metric: binding.metric }))) return;
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
    <section className="zip-bdfb-live-average sm-snmp-setup" aria-label={t('feederConfiguration')}>
      <header>
        <strong>{t('title')}</strong>
      </header>
      <p>{t('help')}</p>
      <Link
        className="sm-snmp-setup-action"
        href={`/device/${encodeURIComponent(chassisId)}#bdfb-access-ports`}
      >
        {t('openInputs')}
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
        <summary>{t('advanced')}</summary>
        {loading && <p role="status">{t('loading')}</p>}
        {configuration && (
          <>
            <p>
              {t('profile')} <strong>{configuration.hardwareProfile ?? t('notSelected')}</strong>
            </p>
            {configuration.canCommission && (
              <div className="sm-snmp-maintenance-actions">
                <button
                  type="button"
                  disabled={
                    busy || loading || configuration.hardwareProfile === 'ELTEK_BDCBB_CONFIG_2'
                  }
                  onClick={() => void activateProfile('ELTEK_BDCBB_CONFIG_2')}
                >
                  {t('useConfig2')}
                </button>
                <button
                  type="button"
                  disabled={
                    busy || loading || configuration.hardwareProfile === 'ELTEK_BDCBB_CONFIG_4'
                  }
                  onClick={() => void activateProfile('ELTEK_BDCBB_CONFIG_4')}
                >
                  {t('useConfig4')}
                </button>
              </div>
            )}
            {configuration.canCommission && configuration.hardwareProfile && (
              <div className="sm-snmp-maintenance-port">
                <label>
                  <strong>{t('voltageTolerance')}</strong>
                  <input
                    type="number"
                    min="0.01"
                    max="20"
                    step="0.01"
                    value={voltageToleranceInput}
                    onChange={(event) => setVoltageToleranceInput(event.target.value)}
                  />
                </label>
                <small>{t('voltageToleranceHelp')}</small>
                <button type="button" disabled={busy || loading} onClick={() => void saveVoltageTolerance()}>
                  {t('saveVoltageTolerance')}
                </button>
              </div>
            )}
            {configuration.ports.map((port) => (
              <div key={port.id} className="sm-snmp-maintenance-port">
                <strong>{port.name}</strong>
                {port.bindings.length === 0 && <small>{t('noOids')}</small>}
                {port.bindings.map((binding) => (
                  <div key={binding.id} className="sm-snmp-maintenance-binding">
                    <small>
                      {binding.metric} · {binding.sourceIdentity}
                      <span>{binding.oid}</span>
                    </small>
                    {configuration.canCommission && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void retire(port.id, binding)}
                      >
                        {t('retire')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </details>
    </section>
  );
}
