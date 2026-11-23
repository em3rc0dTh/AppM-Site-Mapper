'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  presentControllerReading,
  type SnmpControllerObservation,
} from '@/modules/telemetry/application/snmp-controller-presentation';
import type { SnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';
import styles from './snmp-controller-live.module.css';

function formattedTimestamp(value: string | null, locale: string): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(time);
}

/**
 * Read-only controller observations. The Device profile determines the source,
 * labels and OIDs. Electrical feed bindings are commissioned elsewhere.
 */
export function SnmpControllerLive({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('snmpController');
  const locale = useLocale();
  const [profile, setProfile] = useState<SnmpControllerProfile | null>(null);
  const [loadedDeviceId, setLoadedDeviceId] = useState<string | null>(null);
  const [signals, setSignals] = useState<SnmpControllerObservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          '/api/telemetry/snmp/controller-profile?' + new URLSearchParams({ deviceId }),
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = (await response.json()) as { profile: SnmpControllerProfile | null };
        if (!controller.signal.aborted) {
          setProfile(data.profile);
          setLoadedDeviceId(deviceId);
          setSignals([]);
          setNow(null);
          setError(null);
        }
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

  if (loadedDeviceId !== deviceId) return null;

  if (!profile) {
    return error ? (
      <section className={styles.section} aria-label={t('title')}>
        <p role="alert" className={styles.error}>
          {t('failed')}: {error}
        </p>
      </section>
    ) : null;
  }

  const readings =
    now === null
      ? []
      : profile.signals.map((spec) => ({
          spec,
          reading: presentControllerReading(
            signals.find((signal) => signal.key === spec.oid),
            spec,
            now,
          ),
        }));
  const freshCount = readings.filter(({ reading }) => reading.state === 'RECENT').length;
  const recent = freshCount === profile.signals.length;
  const freshnessLabels = {
    RECENT: t('freshness.RECENT'),
    STALE: t('freshness.STALE'),
    UNAVAILABLE: t('freshness.UNAVAILABLE'),
    INVALID: t('freshness.INVALID'),
  };

  return (
    <section className={styles.section} aria-label={profile.title}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.sourceIcon} aria-hidden="true">
            ◉
          </span>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>{t('controllerEyebrow')}</span>
            <h3 className={styles.title}>{profile.title}</h3>
          </div>
        </div>
        <div
          className={styles.overallStatus}
          data-status={error ? 'error' : recent ? 'live' : 'pending'}
          role="status"
        >
          <span className={styles.statusDot} aria-hidden="true" />
          <span>{error ? t('queryError') : recent ? t('samplesRecent') : t('incomplete')}</span>
        </div>
      </header>

      <dl className={styles.metricGrid}>
        {profile.signals.map((spec) => {
          const item = readings.find(({ spec: candidate }) => candidate.oid === spec.oid);
          const reading = item?.reading;
          const state = error ? 'UNAVAILABLE' : (reading?.state ?? 'UNAVAILABLE');
          const visible = !error && reading?.state === 'RECENT';
          const timestamp = reading?.receivedAt
            ? formattedTimestamp(reading.receivedAt, locale)
            : null;
          const isValid = visible && reading?.quality === 'VALID';
          return (
            <div className={styles.metric} key={spec.oid} data-state={state}>
              <div className={styles.metricHeader}>
                <dt className={styles.metricLabel} title={spec.label}>
                  {spec.label}
                </dt>
                <span
                  className={styles.quality}
                  data-quality={isValid ? 'valid' : visible ? 'unknown' : 'inactive'}
                  title={t('qualityLabel')}
                >
                  <span className={styles.qualityDot} aria-hidden="true" />
                  {visible ? reading?.quality : freshnessLabels[state]}
                </span>
              </div>
              <dd className={styles.metricValue}>{visible ? reading.text : '—'}</dd>
              <div className={styles.metricMeta}>
                <span className={styles.rawPill}>
                  {t('raw')}: {reading?.raw ?? '—'}
                </span>
                <span className={styles.metricTime}>
                  {timestamp && reading?.receivedAt ? (
                    <time
                      dateTime={reading.receivedAt}
                      title={new Date(reading.receivedAt).toLocaleString(locale)}
                    >
                      {timestamp}
                    </time>
                  ) : (
                    t('noTimestamp')
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </dl>

      <footer className={styles.footer}>
        <div className={styles.sourceDetail}>
          <span className={styles.sourceCaption}>{t('source')}</span>
          <code className={styles.sourceName} title={profile.sourceIdentity}>
            {profile.sourceIdentity}
          </code>
        </div>
        <span className={styles.polling}>{t('polling')}</span>
      </footer>
      <div className={styles.notice}>
        <span aria-hidden="true" className={styles.noticeSymbol} />
        <p>{t('disclaimer')}</p>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {t('failed')}: {error}
        </p>
      )}
    </section>
  );
}
