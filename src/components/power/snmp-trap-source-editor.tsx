'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type SourcesResponse = {
  sources: string[];
  availableSources: string[];
  canConfigure: boolean;
};

export function SnmpTrapSourceEditor({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('snmpTraps');
  const [sources, setSources] = useState<string[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/telemetry/industrial/traps/sources?' + new URLSearchParams({ deviceId }), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json() as Promise<SourcesResponse>;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setSources(body.sources);
        setAvailable(body.availableSources);
        setCanConfigure(body.canConfigure);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus(t('sourceLoadError'));
      });
    return () => controller.abort();
  }, [deviceId, t]);

  async function save() {
    if (!window.confirm(t('confirmMapping'))) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/telemetry/industrial/traps/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, sources, confirmMapping: true }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'SOURCE_SAVE_FAILED');
      setStatus(t('sourcesSaved'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('sourceLoadError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="zip-bdfb-live-average sm-snmp-setup" aria-label={t('settingsTitle')}>
      <header><strong>{t('settingsTitle')}</strong></header>
      <p>{t('settingsHelp')}</p>
      <div className="sm-snmp-maintenance-port">
        {available.length === 0 && <p>{t('noAvailableSources')}</p>}
        {available.map((identity) => (
          <label key={identity} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={sources.includes(identity)}
              disabled={!canConfigure || busy}
              onChange={(event) => setSources((current) =>
                event.target.checked
                  ? [...current, identity].slice(0, 8)
                  : current.filter((item) => item !== identity),
              )}
            />
            <code>{identity}</code>
          </label>
        ))}
        {canConfigure && (
          <button type="button" disabled={busy} onClick={() => void save()}>
            {t('saveSources')}
          </button>
        )}
        {status && <p role="status">{status}</p>}
      </div>
    </section>
  );
}
