'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  SnmpControllerProjection,
  SnmpDigitalInput,
} from '@/modules/telemetry/application/snmp-controller-projection';

export function SnmpDigitalInputsTable({ rows, now }: Readonly<{
  rows: readonly SnmpDigitalInput[];
  now: number | null;
}>) {
  const t = useTranslations('snmpController');
  const locale = useLocale();
  if (!rows.length) return null;
  return (
    <section className="front01-inputs-summary" aria-label={t('digitalInputs')}>
      <header className="front01-summary-header">
        <strong>{t('digitalInputs')}</strong>
        <span>SNMP</span>
      </header>
      <div className="front01-inputs-table-wrap">
        <table className="front01-inputs-table">
          <thead><tr>
            <th>{t('signalLabel')}</th>
            <th>{t('digitalStatus')}</th>
            <th>{t('digitalAlarmEnabled')}</th>
            <th>{t('digitalConfiguration')}</th>
            <th>{t('raw')}</th>
            <th>{t('lastReading')}</th>
          </tr></thead>
          <tbody>{rows.map((row) => {
            const fresh = now !== null && row.expiresAt !== null && row.expiresAt >= now;
            const time = row.observedAt ? Date.parse(row.observedAt) : NaN;
            return <tr key={row.key}>
              <td><strong>{fresh ? row.label ?? '—' : '—'}</strong></td>
              <td>{!fresh ? t('freshness.STALE') :
                row.status === 'normal' ? t('digitalNormal') :
                row.status ?? t('freshness.UNAVAILABLE')}</td>
              <td>{!fresh || row.enabled === null ? '—' :
                row.enabled ? t('digitalEnabled') : t('digitalDisabled')}</td>
              <td>{fresh ? row.configuration ?? '—' : '—'}</td>
              <td>{fresh ? row.value ?? '—' : '—'}</td>
              <td>{Number.isFinite(time) ? new Intl.DateTimeFormat(locale, {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                second: '2-digit', hour12: false,
              }).format(time) : '—'}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer className="front01-inputs-note">{t('digitalDisclaimer')}</footer>
    </section>
  );
}

/** Alarm tab consumes the same read-only controller projection as the summary. */
export function SnmpDigitalInputsPanel({ deviceId }: Readonly<{ deviceId: string }>) {
  const [rows, setRows] = useState<readonly SnmpDigitalInput[]>([]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch('/api/telemetry/snmp/feeds?' + new URLSearchParams({ deviceId }), {
          cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error('HTTP_' + response.status);
        const data = await response.json() as { controllerProjection?: SnmpControllerProjection | null };
        if (!abort.signal.aborted) {
          setRows(data.controllerProjection?.digitalInputs ?? []);
          setNow(Date.now());
        }
      } catch {
        if (!abort.signal.aborted) setNow(Date.now());
      } finally {
        pending = false;
      }
    }
    setRows([]);
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    return () => { abort.abort(); clearInterval(interval); clearInterval(clock); };
  }, [deviceId]);
  return <SnmpDigitalInputsTable rows={rows} now={now} />;
}
