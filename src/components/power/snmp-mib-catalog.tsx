'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import {
  fetchControllerSignals,
  type ControllerCatalogSignal,
} from '@/modules/telemetry/application/controller-signals-client';
import {
  parseSnmpControllerProfile,
  type SnmpControllerProfile,
} from '@/modules/telemetry/domain/snmp-controller-profile';

type InputRow = {
  index: string;
  label: string;
  status: string;
  alarmEnabled: string;
  configuration: string;
  observedAt: string;
};

function raw(signal: ControllerCatalogSignal | undefined): unknown {
  return signal?.lastObservation?.rawValue ?? signal?.rawValue;
}

function localizedEnum(value: string, locale: string): string {
  if (!locale.toLowerCase().startsWith('es')) return value;
  return (
    (
      {
        normal: 'Normal',
        enabled: 'Habilitada',
        disabled: 'Deshabilitada',
        normallyOpen: 'Normalmente abierto',
        normallyClosed: 'Normalmente cerrado',
        minorAlarm: 'Alarma menor',
        majorAlarm: 'Alarma mayor',
        critical: 'Crítica',
        warning: 'Advertencia',
        error: 'Error',
        disconnected: 'Desconectada',
        notPresent: 'No presente',
      } as Record<string, string>
    )[value] ?? value
  );
}

function textValue(signal: ControllerCatalogSignal | undefined, locale: string): string {
  if (!signal) return '—';
  if (signal.enumLabel) return localizedEnum(signal.enumLabel, locale);
  const value = raw(signal);
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') {
    const encoded = value as { encoding?: string; bytes?: string };
    if (encoded.encoding === 'base64' && typeof encoded.bytes === 'string') {
      try {
        const bytes = Uint8Array.from(atob(encoded.bytes), (character) => character.charCodeAt(0));
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (!/[\x00-\x1f\x7f]/.test(text)) return text.trim() || '—';
      } catch {
        return '—';
      }
    }
    return '—';
  }
  return String(value);
}

function observedAt(signal: ControllerCatalogSignal | undefined): string {
  return signal?.lastObservation?.observedAt ?? signal?.observedAt ?? signal?.receivedAt ?? '';
}

function localTime(value: string, locale: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(time);
}

function scaled(
  signal: ControllerCatalogSignal | undefined,
  scale: number | undefined,
  unit: string,
): string {
  const value = raw(signal);
  if (typeof value !== 'number' || !Number.isFinite(value) || scale === undefined) return '—';
  return `${(value * scale).toFixed(2)} ${unit}`;
}

function suffix(signal: ControllerCatalogSignal): string | null {
  const match = signal.key.match(/\.(\d+)$/);
  return match?.[1] ?? null;
}

export function SnmpMibCatalog({ deviceId }: Readonly<{ deviceId: string }>) {
  const t = useTranslations('snmpController');
  const locale = useLocale();
  const [profile, setProfile] = useState<SnmpControllerProfile | null>(null);
  const [signals, setSignals] = useState<ControllerCatalogSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(
          '/api/telemetry/snmp/controller-profile?' + new URLSearchParams({ deviceId }),
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body = (await response.json()) as { profile: SnmpControllerProfile | null };
        const parsed = body.profile ? parseSnmpControllerProfile(body.profile) : null;
        if (!parsed) throw new Error('SNMP_PROFILE_UNAVAILABLE');
        const observed = await fetchControllerSignals(parsed.sourceIdentity, controller.signal);
        if (!controller.signal.aborted) {
          setProfile(parsed);
          setSignals(observed);
          setError('');
          setLoading(false);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'SNMP_CONTROLLER_UNAVAILABLE');
          setLoading(false);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 60_000);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [deviceId]);

  const byName = useMemo(() => {
    const groups = new Map<string, ControllerCatalogSignal[]>();
    for (const signal of signals) {
      const name = signal.mibName ?? '';
      const current = groups.get(name) ?? [];
      current.push(signal);
      groups.set(name, current);
    }
    return groups;
  }, [signals]);

  const inputRows = useMemo<InputRow[]>(() => {
    const descriptions = byName.get('inputIoUnitProgInputDescription') ?? [];
    const statuses = byName.get('inputIoUnitProgInputStatus') ?? [];
    const enabled = byName.get('inputIoUnitProgInputAlarmEnable') ?? [];
    const configurations = byName.get('inputIoUnitProgInputConfiguration') ?? [];
    return descriptions
      .flatMap((description) => {
        const index = suffix(description);
        if (!index) return [];
        const status = statuses.find((signal) => suffix(signal) === index);
        const alarmEnabled = enabled.find((signal) => suffix(signal) === index);
        const configuration = configurations.find((signal) => suffix(signal) === index);
        const times = [description, status, alarmEnabled, configuration]
          .map(observedAt)
          .filter(Boolean)
          .sort();
        return [
          {
            index,
            label: textValue(description, locale),
            status: textValue(status, locale),
            alarmEnabled: textValue(alarmEnabled, locale),
            configuration: textValue(configuration, locale),
            observedAt: times.at(-1) ?? '',
          },
        ];
      })
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
  }, [byName, locale]);

  if (loading) return <p role="status">{t('operationalLoading')}</p>;
  if (error || !profile)
    return (
      <p role="alert" className="form-error">
        {t('failed')}: {error || 'SNMP_PROFILE_UNAVAILABLE'}
      </p>
    );

  const status = signals.find((signal) => signal.mibName === 'powerSystemStatus');
  const total = signals.find((signal) => signal.key === profile.balance?.totalOid);
  const voltage = signals.find((signal) => signal.key === profile.balance?.voltageOid);
  const normalization = profile.balance?.normalization;
  const normalInputs = inputRows.filter((row) => row.status.toLowerCase() === 'normal').length;
  const activeInputs = inputRows.filter((row) => /alarma|alarm/i.test(row.status)).length;

  return (
    <section
      className="front01-inputs-summary front01-inputs-summary--operator"
      aria-label={t('operationalTitle')}
    >
      <header className="front01-inputs-heading">
        <h2>{t('operationalTitle')}</h2>
        <div>
          <span>{profile.title}</span>
          <strong>{textValue(status, locale).toUpperCase()}</strong>
        </div>
      </header>

      <dl className="front01-snmp-kpis front01-snmp-kpis--operator">
        <div>
          <dt>{t('generalCurrent')}</dt>
          <dd>{scaled(total, normalization?.totalCurrentScale, 'A')}</dd>
        </div>
        <div>
          <dt>{t('dcVoltage')}</dt>
          <dd>{scaled(voltage, normalization?.voltageScale, 'V')}</dd>
        </div>
        <div>
          <dt>{t('operationalInputs')}</dt>
          <dd>
            {normalInputs} / {inputRows.length}
          </dd>
        </div>
        <div>
          <dt>{t('operationalActiveAlarms')}</dt>
          <dd>{activeInputs}</dd>
        </div>
      </dl>

      {inputRows.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="front01-snmp-table">
            <thead>
              <tr>
                <th>{t('operationalInput')}</th>
                <th>{t('operationalCondition')}</th>
                <th>{t('operationalAlarm')}</th>
                <th>{t('operationalContact')}</th>
                <th>{t('catalogLastReading')}</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((row) => (
                <tr key={row.index}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.alarmEnabled}</td>
                  <td>{row.configuration}</td>
                  <td>{localTime(row.observedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
