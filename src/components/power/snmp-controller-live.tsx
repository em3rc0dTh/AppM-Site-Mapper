'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  presentControllerReading,
  type SnmpControllerObservation,
} from '@/modules/telemetry/application/snmp-controller-presentation';
import type { SnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';
import { parseSnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';
import { fetchControllerSignals } from '@/modules/telemetry/application/controller-signals-client';
import {
  configuredControllerCapacity,
  controllerSummary,
} from '@/modules/telemetry/application/controller-summary';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import styles from './snmp-controller-live.module.css';

function formatSnmpRaw(value: unknown): string {
  if (value === null || value === undefined) return '—';

  if (typeof value === 'object') {
    const encoded = value as {
      encoding?: string;
      bytes?: string;
    };

    if (
      encoded.encoding === 'base64' &&
      typeof encoded.bytes === 'string'
    ) {
      try {
        const bytes = Uint8Array.from(
          atob(encoded.bytes),
          c => c.charCodeAt(0)
        );
        const text = new TextDecoder(
          'utf-8', { fatal: true }
        ).decode(bytes);

        if (!/[\\x00-\\x1f\\x7f]/.test(text))
          return text.trim() || '—';
      } catch {
        // Preserve binary values without inventing text.
      }
    }

    return JSON.stringify(value);
  }

  return String(value);
}

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
  const [ratedA, setRatedA] = useState<number | null>(null);
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
          const parsed = data.profile === null ? null : parseSnmpControllerProfile(data.profile);
          if (data.profile !== null && !parsed) throw new Error(t('invalidResponse'));
          setProfile(parsed);
          setLoadedDeviceId(deviceId);
          setSignals([]);
          setNow(null);
          setError(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setLoadedDeviceId(deviceId);
          setProfile(null);
          setError(cause instanceof Error ? cause.message : t('unavailable'));
        }
      }
    })();
    return () => controller.abort();
  }, [deviceId, t]);

  useEffect(() => {
    if (!profile) return;
    let mounted = true;
    let pending = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]);
        const observations = await fetchControllerSignals(profile.sourceIdentity, signal);
        let configuredRating: number | null = null;
        try {
          const response = await fetch(
            '/api/telemetry/snmp/feeds?' + new URLSearchParams({ deviceId }),
            { cache: 'no-store', signal },
          );
          if (response.ok)
            configuredRating = configuredControllerCapacity(
              (await response.json()) as SnmpBdfbLoadView,
            );
        } catch {
          /* Capacity remains unavailable independently of controller readings. */
        }
        if (mounted) {
          setSignals(observations);
          setRatedA(configuredRating);
          setNow(Date.now());
          setError(null);
        }
      } catch (cause) {
        if (mounted) {
          setSignals([]);
          setRatedA(null);
          setError(cause instanceof Error ? cause.message : t('unavailable'));
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const polling = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      mounted = false;
      controller.abort();
      clearInterval(polling);
      clearInterval(clock);
    };
  }, [profile, deviceId, t]);

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
  const summary = now === null || error ? null : controllerSummary(profile, signals, now);
  const hasSummary = profile.signals.some((spec) => spec.displayMode === 'NORMALIZED');
  const number = (value: number | null | undefined, unit: string) =>
    value === null || value === undefined
      ? '—'
      : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} ${unit}`;
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

      {hasSummary && (
        <dl className={styles.metricGrid} aria-label={t('generalSummary')}>
          <div className={styles.metric}>
            <dt>{t('generalCurrent')}</dt>
            <dd className={styles.metricValue}>{number(summary?.currentA, 'A')}</dd>
            <small>{t('normalizedSource')}</small>
          </div>
          <div className={styles.metric}>
            <dt>{t('dcVoltage')}</dt>
            <dd className={styles.metricValue}>{number(summary?.voltageV, 'V')}</dd>
            <small>{t('verifiedScaleRequired')}</small>
          </div>
          <div className={styles.metric}>
            <dt>{t('nominalCapacity')}</dt>
            <dd className={styles.metricValue}>{number(error ? null : ratedA, 'A')}</dd>
            <small>{t('configuredCapacity')}</small>
          </div>
          <div className={styles.metric}>
            <dt>{t('estimatedPower')}</dt>
            <dd className={styles.metricValue}>{number(summary?.estimatedPowerKw, 'kW')}</dd>
            <small>{t('diagnosticEstimate')}</small>
          </div>
        </dl>
      )}
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


      <details style={{ margin: '16px 0' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Catálogo SNMP completo · {signals.length} señales
        </summary>

        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="front01-snmp-table">
            <thead>
              <tr>
                <th>Variable MIB</th>
                <th>OID</th>
                <th>RAW</th>
                <th>Valor interpretado</th>
                <th>Calidad</th>
                <th>Última lectura</th>
              </tr>
            </thead>
            <tbody>
              {[...signals]
                .sort((a, b) =>
                  a.key.localeCompare(b.key, undefined, {
                    numeric: true
                  })
                )
                .map(signal => {
                  const item = signal as
                    SnmpControllerObservation & {
                      mibName?: string | null;
                      communicationQuality?: string;
                    };

                  const observed =
                    item.lastObservation?.observedAt ??
                    item.observedAt ??
                    item.receivedAt;

                  const raw =
                    item.lastObservation?.rawValue ??
                    item.rawValue;

                  const age =
                    (now ?? Date.now()) - Date.parse(observed);

                  const fresh =
                    Number.isFinite(age) &&
                    age >= -10000 &&
                    age <= (item.staleMs ?? 90000) &&
                    item.communicationQuality !== 'STALE';

                  const interpreted =
                    item.enumLabel ??
                    (item.quality === 'VALID'
                      ? item.value
                      : null);

                  return (
                    <tr key={item.key}>
                      <td>{item.mibName ?? '—'}</td>
                      <td><code>{item.key}</code></td>
                      <td>
                        {formatSnmpRaw(raw)}
                      </td>
                      <td>
                        {interpreted === null ||
                         interpreted === undefined
                          ? '—'
                          : String(interpreted)}
                      </td>
                      <td>
                        {!fresh
                          ? 'STALE'
                          : item.quality === 'UNKNOWN'
                            ? 'RAW / Sin normalizar'
                            : item.quality}
                      </td>
                      <td>
                        {formattedTimestamp(observed, locale)
                          ?? '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </details>

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
