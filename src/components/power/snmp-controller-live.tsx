'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  presentControllerReading,
  type SnmpControllerObservation,
} from '@/modules/telemetry/application/snmp-controller-presentation';
import type { SnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';

/** Source and OIDs are resolved per DEVICE from persisted configuration. */
export function SnmpControllerLive({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('snmpController');
  const locale = useLocale();
  const [profile, setProfile] = useState<SnmpControllerProfile | null>(null);
  const [signals, setSignals] = useState<SnmpControllerObservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setSignals([]);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(
          '/api/telemetry/snmp/controller-profile?' + new URLSearchParams({ deviceId }),
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = (await response.json()) as { profile: SnmpControllerProfile | null };
        if (!controller.signal.aborted) setProfile(data.profile);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : t('unavailable'));
      }
    })();
    return () => controller.abort();
  }, [deviceId, t]);

  useEffect(() => {
    if (!profile) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(
          '/api/telemetry/industrial/signals?' +
            new URLSearchParams({ source: profile.sourceIdentity, limit: '500' }),
          { cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = (await response.json()) as { signals?: SnmpControllerObservation[] };
        if (!Array.isArray(data.signals)) throw new Error(t('invalidResponse'));
        if (mounted) {
          setSignals(data.signals);
          setNow(Date.now());
          setError(null);
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : t('unavailable'));
      }
    };
    void refresh();
    const polling = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      mounted = false;
      clearInterval(polling);
      clearInterval(clock);
    };
  }, [profile, t]);

  if (!profile) {
    return error ? (
      <section className="front01-snmp-summary" aria-label={t('title')}>
        <p role="alert">{t('failed')}: {error}</p>
      </section>
    ) : null;
  }

  const readings = profile.signals.map((spec) => ({
    spec,
    reading: presentControllerReading(
      signals.find((signal) => signal.key === spec.oid),
      spec,
      now ?? Date.now(),
    ),
  }));
  const recent = readings.every(({ reading }) => reading.state === 'RECENT');
  const freshnessLabels = {
    RECENT: t('freshness.RECENT'),
    STALE: t('freshness.STALE'),
    UNAVAILABLE: t('freshness.UNAVAILABLE'),
    INVALID: t('freshness.INVALID'),
  };

  return (
    <section className="front01-snmp-summary" aria-label={profile.title}>
      <header className="front01-summary-header">
        <strong>{profile.title}</strong>
        <span>{error ? t('queryError') : recent ? t('samplesRecent') : t('incomplete')}</span>
      </header>
      <dl className="front01-snmp-kpis">
        {readings.map(({ spec, reading }) => (
          <div key={spec.oid}>
            <dt>{spec.label}</dt>
            <dd>{error || reading.state !== 'RECENT' ? '—' : reading.text}</dd>
            <small>
              {freshnessLabels[reading.state]} · {reading.quality} · {t('raw')}: {reading.raw}
              {' · '}
              {reading.receivedAt
                ? new Date(reading.receivedAt).toLocaleString(locale)
                : t('noTimestamp')}
            </small>
          </div>
        ))}
      </dl>
      <div className="front01-snmp-footer">
        <small>{t('source')}: {profile.sourceIdentity} · {t('polling')}</small>
        {error && <small role="alert">{t('failed')}: {error}</small>}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.8 }}>{t('disclaimer')}</p>
    </section>
  );
}
