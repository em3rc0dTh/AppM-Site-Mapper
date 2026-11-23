'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  SnmpControllerProfile,
  SnmpControllerSignal,
} from '@/modules/telemetry/domain/snmp-controller-profile';

type EditableSignal = SnmpControllerSignal;
type DiscoveredSignal = { key: string; mibName?: string | null; protocol: string };
import smartpackTemplate from '../../../config/industrial/smartpack2-controller.template.json';
import { parseSnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';
import { fetchControllerSignals } from '@/modules/telemetry/application/controller-signals-client';

export function SnmpControllerEditor({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('snmpController');
  const [title, setTitle] = useState('');
  const [sourceIdentity, setSourceIdentity] = useState('');
  const [signals, setSignals] = useState<EditableSignal[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredSignal[]>([]);
  const [selectedOid, setSelectedOid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          '/api/telemetry/snmp/controller-profile?' + new URLSearchParams({ deviceId }),
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body = (await response.json()) as {
          profile: SnmpControllerProfile | null;
          canConfigure: boolean;
        };
        if (controller.signal.aborted) return;
        setCanConfigure(body.canConfigure);
        setTitle(body.profile?.title ?? '');
        setSourceIdentity(body.profile?.sourceIdentity ?? '');
        setSignals(body.profile?.signals.map((item) => ({ ...item })) ?? []);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : t('unavailable'));
      }
    })();
    return () => controller.abort();
  }, [deviceId, t]);

  const edit = (index: number, patch: Partial<EditableSignal>) =>
    setSignals((current) =>
      current.map((signal, position) => (index === position ? { ...signal, ...patch } : signal)),
    );

  async function discover() {
    if (!sourceIdentity.trim()) {
      setError(t('sourceRequired'));
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const observed = await fetchControllerSignals(sourceIdentity.trim());
      setDiscovered(observed.filter((signal) => /^\d+(?:\.\d+){5,}$/.test(signal.key)));
      setSelectedOid('');
      setMessage(t('discoveryComplete'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('unavailable'));
    } finally {
      setBusy(false);
    }
  }

  function addDiscovered() {
    const signal = discovered.find((item) => item.key === selectedOid);
    if (!signal || signals.some((item) => item.oid === signal.key)) return;
    setSignals((current) => [
      ...current,
      { oid: signal.key, label: signal.mibName || signal.key, displayMode: 'RAW' },
    ]);
  }

  function addSmartpackSignals() {
    const template = parseSnmpControllerProfile(smartpackTemplate)!;
    const additions = template.signals.filter(
      (candidate) => !signals.some((signal) => signal.oid === candidate.oid),
    );
    if (signals.length + additions.length > 16) {
      setError(t('tooManySignals'));
      return;
    }
    // Preserve existing OIDs, labels and presentation choices. No source identity is inferred.
    setSignals((current) => [...current, ...additions]);
    if (!title.trim()) setTitle(template.title);
    setMessage(t('templateAdded'));
  }

  async function save() {
    if (!window.confirm(t('confirmSave'))) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const profile: SnmpControllerProfile = {
        schemaVersion: 1,
        title: title.trim(),
        sourceIdentity: sourceIdentity.trim(),
        signals: signals.map((item): SnmpControllerSignal => ({
          oid: item.oid.trim(),
          label: item.label.trim(),
          displayMode: item.displayMode,
          ...(item.metric ? { metric: item.metric } : {}),
        })),
      };
      const response = await fetch('/api/telemetry/snmp/controller-profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, profile, confirmConfiguration: true }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'PROFILE_SAVE_FAILED');
      setMessage(t('saved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('unavailable'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="zip-bdfb-live-average sm-snmp-setup" aria-label={t('editorTitle')}>
      <header>
        <strong>{t('editorTitle')}</strong>
      </header>
      <p>{t('editorHelp')}</p>
      <div className="sm-snmp-maintenance-port">
        <label>
          {t('controllerTitle')}
          <input
            value={title}
            maxLength={96}
            disabled={!canConfigure || busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          {t('sourceIdentity')}
          <input
            value={sourceIdentity}
            maxLength={120}
            disabled={!canConfigure || busy}
            onChange={(event) => {
              setSourceIdentity(event.target.value);
              setDiscovered([]);
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !sourceIdentity.trim()}
          onClick={() => void discover()}
        >
          {t('discover')}
        </button>
        {discovered.length > 0 && (
          <div>
            <label>
              {t('observedSignals')}
              <select value={selectedOid} onChange={(event) => setSelectedOid(event.target.value)}>
                <option value="">{t('selectSignal')}</option>
                {discovered.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.mibName || item.key} · {item.key}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!canConfigure || !selectedOid || busy || signals.length >= 16}
              onClick={addDiscovered}
            >
              {t('addObserved')}
            </button>
          </div>
        )}
        {signals.map((signal, index) => (
          <div key={index} className="sm-snmp-maintenance-binding">
            <label>
              {t('oid')}
              <input
                value={signal.oid}
                disabled={!canConfigure || busy}
                maxLength={256}
                onChange={(event) => edit(index, { oid: event.target.value })}
              />
            </label>
            <label>
              {t('signalLabel')}
              <input
                value={signal.label}
                disabled={!canConfigure || busy}
                maxLength={96}
                onChange={(event) => edit(index, { label: event.target.value })}
              />
            </label>
            <label>
              {t('displayMode')}
              <select
                value={signal.displayMode}
                disabled={!canConfigure || busy}
                onChange={(event) =>
                  edit(index, {
                    displayMode: event.target.value as EditableSignal['displayMode'],
                    metric: event.target.value === 'NORMALIZED' ? 'CURRENT' : undefined,
                  })
                }
              >
                <option value="RAW">{t('rawMode')}</option>
                <option value="ENUM">{t('enumMode')}</option>
                <option value="NORMALIZED">{t('normalizedMode')}</option>
              </select>
            </label>
            {signal.displayMode === 'NORMALIZED' && (
              <label>
                {t('generalMagnitude')}
                <select
                  value={signal.metric ?? 'CURRENT'}
                  disabled={!canConfigure || busy}
                  onChange={(event) =>
                    edit(index, { metric: event.target.value as 'CURRENT' | 'VOLTAGE' })
                  }
                >
                  <option value="CURRENT">{t('generalCurrent')}</option>
                  <option value="VOLTAGE">{t('dcVoltage')}</option>
                </select>
              </label>
            )}
            {canConfigure && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setSignals((current) => current.filter((_, i) => i !== index))}
              >
                {t('remove')}
              </button>
            )}
          </div>
        ))}
        {canConfigure && (
          <div className="sm-snmp-maintenance-actions">
            <button type="button" disabled={busy} onClick={addSmartpackSignals}>
              {t('addSmartpack')}
            </button>
            <button
              type="button"
              disabled={busy || signals.length >= 16}
              onClick={() =>
                setSignals((current) => [...current, { oid: '', label: '', displayMode: 'RAW' }])
              }
            >
              {t('addManual')}
            </button>
            <button type="button" disabled={busy || !signals.length} onClick={() => void save()}>
              {t('save')}
            </button>
          </div>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <small>{t('disclaimer')}</small>
    </section>
  );
}
