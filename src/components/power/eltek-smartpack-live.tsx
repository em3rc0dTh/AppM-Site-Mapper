'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ELTEK_SMARTPACK_OIDS,
  ELTEK_SMARTPACK_SOURCE,
  presentEltekReading,
  type EltekSignal,
} from '@/modules/telemetry/application/eltek-live-presentation';

const FIELDS = ['system', 'current', 'battery'] as const;

export function EltekSmartpackLive() {
  const t = useTranslations('eltekLive');
  const locale = useLocale();
  const labels = t.raw('labels') as Record<(typeof FIELDS)[number], string>;
  const freshness = t.raw('freshness') as Record<string, string>;
  const statusLabels = t.raw('statusLabels') as Record<string, string>;
  const [signals, setSignals] = useState<EltekSignal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          '/api/telemetry/industrial/signals?source=' +
            encodeURIComponent(ELTEK_SMARTPACK_SOURCE) +
            '&limit=100',
          { credentials: 'same-origin', cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const payload = (await response.json()) as { signals?: EltekSignal[] };
        if (!Array.isArray(payload.signals)) throw new Error('Unexpected signals response');
        if (mounted) {
          setSignals(payload.signals);
          setNow(Date.now());
          setError(null);
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Unavailable');
      }
    };
    void refresh();
    const poll = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      mounted = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const readings =
    now === null
      ? []
      : FIELDS.map((key) => ({
          key,
          label: labels[key],
          reading: presentEltekReading(
            signals.find((signal) => signal.key === ELTEK_SMARTPACK_OIDS[key]),
            now,
            key,
          ),
        }));
  const recent =
    readings.length === FIELDS.length &&
    readings.every(({ reading }) => reading.state === 'RECENT');

  return (
    <section
      className="front01-snmp-summary"
      aria-label={t("ariaLabel")}
    >
      <header className="front01-summary-header">
        <strong>{t('title')}</strong>
        <span>
          {error
            ? t('queryError')
            : recent
              ? t('samplesRecent')
              : t('incomplete')}
        </span>
      </header>
      <dl className="front01-snmp-kpis">
        {readings.map(({ key, label, reading }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {error || reading.state !== 'RECENT'
                ? '—'
                : key === 'system'
                  ? statusLabels[reading.raw]
                    ? `${statusLabels[reading.raw]} (${reading.raw})`
                    : t('unknownStatus', { value: reading.raw })
                  : reading.text}
            </dd>
            <small>
              {freshness[reading.state] ?? reading.state} · {reading.quality} · {t('raw')}: {reading.raw}
              {' · '}
              {reading.receivedAt
                ? new Date(reading.receivedAt).toLocaleString(locale.startsWith('es') ? 'es-PE' : 'en-US', { timeZone: 'America/Lima' })
                : t('noTimestamp')}
            </small>
          </div>
        ))}
      </dl>
      <div className="front01-snmp-footer">
        <small>{t('source')}: {ELTEK_SMARTPACK_SOURCE} · {t('polling')}</small>
        {error ? <small role="alert">{t('failed')}: {error}</small> : null}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>
        {t('disclaimer')}
      </p>
    </section>
  );
}
