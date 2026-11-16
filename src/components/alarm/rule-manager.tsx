'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import type { AlarmSeverity } from '@/modules/alarm/domain/entities';
import {
  DEFAULT_DC_PROFILE,
  MANAGED_RULE_CODES,
  ruleMetric,
  type ManagedRuleCode,
  type RuleScope,
} from '@/modules/alarm/domain/rule-manager';
import type { ManagedRuleRecord } from '@/modules/alarm/infrastructure/rule-manager-store';

type InputField = Readonly<{ key: string; unit: string; defaultValue: number }>;
type AlarmTarget = Readonly<{
  scope: RuleScope;
  id: string | null;
  deviceName?: string;
  panelName?: string;
  breakerName?: string;
}>;

const PARAMS: Readonly<Record<ManagedRuleCode, readonly InputField[]>> = {
  LOW_VOLTAGE: [
    { key: 'assertBelowV', unit: 'V', defaultValue: 45.5 },
    { key: 'clearAboveV', unit: 'V', defaultValue: 48 },
  ],
  HIGH_VOLTAGE: [
    { key: 'assertAboveV', unit: 'V', defaultValue: 56.5 },
    { key: 'clearBelowV', unit: 'V', defaultValue: 54.5 },
  ],
  VOLTAGE_LOSS: [
    { key: 'zeroToleranceV', unit: 'V', defaultValue: 1 },
    { key: 'clearAboveV', unit: 'V', defaultValue: 43 },
  ],
  LOW_CURRENT: [
    { key: 'assertBelowA', unit: 'A', defaultValue: 0.5 },
    { key: 'clearAboveA', unit: 'A', defaultValue: 1 },
  ],
  LOAD_LOSS: [
    { key: 'zeroToleranceA', unit: 'A', defaultValue: 0.2 },
    { key: 'referenceMinA', unit: 'A', defaultValue: 1 },
  ],
  SUDDEN_CURRENT_DROP: [
    { key: 'referenceCurrentA', unit: 'A', defaultValue: 8.4 },
    { key: 'dropPercent', unit: '%', defaultValue: 50 },
    { key: 'clearDropPercent', unit: '%', defaultValue: 25 },
  ],
  LOW_POWER: [
    { key: 'assertBelowW', unit: 'W', defaultValue: 25 },
    { key: 'clearAboveW', unit: 'W', defaultValue: 50 },
  ],
  HIGH_POWER: [
    { key: 'assertAboveW', unit: 'W', defaultValue: 2500 },
    { key: 'clearBelowW', unit: 'W', defaultValue: 2000 },
  ],
  NO_ENERGY_INCREMENT: [
    { key: 'maxDeltaKwh', unit: 'kWh', defaultValue: 0.001 },
    { key: 'windowMs', unit: 'ms', defaultValue: 300000 },
  ],
  ENERGY_COUNTER_RESET: [
    { key: 'minDecrementKwh', unit: 'kWh', defaultValue: 0.001 },
  ],
  ENERGY_CONSUMPTION_ANOMALY: [
    { key: 'minDeltaKwh', unit: 'kWh', defaultValue: 0.001 },
    { key: 'maxDeltaKwh', unit: 'kWh', defaultValue: 5 },
    { key: 'windowMs', unit: 'ms', defaultValue: 300000 },
  ],
};

function defaults(code: ManagedRuleCode): Record<string, number | boolean> {
  const params: Record<string, number | boolean> = Object.fromEntries(
    PARAMS[code].map((field) => [field.key, field.defaultValue]),
  );
  if (code === 'LOAD_LOSS' || code === 'NO_ENERGY_INCREMENT') params.expectedLoad = true;
  return params;
}

function targetKey(scope: RuleScope, id: string | null): string {
  return scope + ':' + (id ?? '');
}

export function RuleManager({
  canEdit,
  initialBreakerId = '',
}: {
  canEdit: boolean;
  initialBreakerId?: string;
}) {
  const t = useTranslations('alarmRules');
  const ruleTitle = (value: ManagedRuleCode) =>
    String(t.raw(('ruleNames.' + value) as Parameters<typeof t.raw>[0]));
  const parameterLabel = (key: string) =>
    String(t.raw(('parameterLabels.' + key) as Parameters<typeof t.raw>[0]));
  const scopeLabel = (value: RuleScope) =>
    ({
      GLOBAL: t('global'),
      QDF: t('qdfDevice'),
      PANEL: t('panel'),
      BREAKER: t('breaker'),
    })[value];

  const [records, setRecords] = useState<readonly ManagedRuleRecord[]>([]);
  const [targets, setTargets] = useState<readonly AlarmTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState<ManagedRuleCode>('LOAD_LOSS');
  const [selectedTarget, setSelectedTarget] = useState(
    initialBreakerId ? targetKey('BREAKER', initialBreakerId) : targetKey('GLOBAL', null),
  );
  const [severity, setSeverity] = useState<AlarmSeverity>('WARNING');
  const [debounce, setDebounce] = useState(3);
  const [recovery, setRecovery] = useState(2);
  const [parameters, setParameters] = useState<Record<string, number | boolean>>(() =>
    defaults('LOAD_LOSS'),
  );

  const targetLabel = (target: AlarmTarget): string => {
    if (target.scope === 'GLOBAL') return t('allBreakers');
    if (target.scope === 'QDF') return `${target.deviceName ?? scopeLabel('QDF')} · ${t('wholeQdf')}`;
    if (target.scope === 'PANEL') {
      return `${target.deviceName ?? scopeLabel('QDF')} · ${target.panelName ?? scopeLabel('PANEL')} · ${t('wholePanel')}`;
    }
    return [target.deviceName, target.panelName, target.breakerName].filter(Boolean).join(' · ');
  };

  const selectedTargetRecord =
    targets.find((target) => targetKey(target.scope, target.id) === selectedTarget) ?? null;
  const selected = records.find((record) => record.id === selectedId) ?? null;

  const reload = useCallback(async () => {
    const [rulesResponse, targetsResponse] = await Promise.all([
      fetch('/api/alarms/rules', { cache: 'no-store' }),
      fetch('/api/alarms/rules/targets', { cache: 'no-store' }),
    ]);
    if (!rulesResponse.ok || !targetsResponse.ok) throw new Error(t('loadManagerError'));
    const rulesBody = (await rulesResponse.json()) as { records: ManagedRuleRecord[] };
    const targetsBody = (await targetsResponse.json()) as { targets: AlarmTarget[] };
    setRecords(rulesBody.records);
    setTargets(targetsBody.targets);
  }, [t]);

  useEffect(() => {
    let active = true;
    void reload()
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t('unexpectedError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, t]);

  const selectRecord = (record: ManagedRuleRecord) => {
    const draft = record.draft;
    setSelectedId(record.id);
    setCode(draft.code);
    setSelectedTarget(targetKey(draft.scope, draft.scopeId));
    setSeverity(draft.severity);
    setDebounce(draft.debounceSamples);
    setRecovery(draft.recoverySamples);
    setParameters({ ...draft.parameters });
    setMessage('');
    setError('');
  };

  const newRule = () => {
    setSelectedId(null);
    setCode('LOAD_LOSS');
    setSelectedTarget(
      initialBreakerId ? targetKey('BREAKER', initialBreakerId) : targetKey('GLOBAL', null),
    );
    setSeverity('WARNING');
    setDebounce(3);
    setRecovery(2);
    setParameters(defaults('LOAD_LOSS'));
    setMessage('');
    setError('');
  };

  const showCode = (next: ManagedRuleCode) => {
    setCode(next);
    setSelectedId(null);
    setParameters(defaults(next));
    setDebounce(next === 'LOAD_LOSS' ? 3 : next === 'ENERGY_COUNTER_RESET' ? 1 : 2);
    setRecovery(2);
    setSeverity(next === 'VOLTAGE_LOSS' ? 'CRITICAL' : 'WARNING');
    setMessage('');
    setError('');
  };

  const post = async (payload: unknown) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/alarms/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string; record?: ManagedRuleRecord };
      if (!response.ok) throw new Error(body.error || t('ruleChangeRejected'));
      await reload();
      if (body.record) setSelectedId(body.record.id);
      setMessage(t('saveSuccess'));
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!selectedTargetRecord) {
      setError(t('chooseTarget'));
      return;
    }
    void post({
      action: 'SAVE_DRAFT',
      rule: {
        ...(selected ? { id: selected.id, expectedRevision: selected.revision } : {}),
        code,
        scope: selectedTargetRecord.scope,
        scopeId: selectedTargetRecord.id,
        electricalProfileId: DEFAULT_DC_PROFILE.id,
        parameters,
        severity,
        debounceSamples: debounce,
        recoverySamples: recovery,
      },
    });
  };

  const change = (action: 'PUBLISH' | 'DISABLE') => {
    if (!selected) return;
    if (action === 'PUBLISH' && !window.confirm(t('publishConfirm'))) return;
    void post({
      action,
      id: selected.id,
      expectedRevision: selected.revision,
      ...(action === 'PUBLISH' ? { confirmImpact: true } : {}),
    });
  };

  const savedRuleLabel = (record: ManagedRuleRecord): string => {
    const match = targets.find(
      (target) => target.scope === record.draft.scope && target.id === record.draft.scopeId,
    );
    return `${ruleTitle(record.draft.code)} · ${match ? targetLabel(match) : scopeLabel(record.draft.scope)}`;
  };

  return (
    <section className="sm-rule-manager sm-rule-simple">
      <header className="sm-rule-simple-head">
        <div>
          <small>{t('eyebrowSimple')}</small>
          <h1>{t('simpleTitle')}</h1>
          <p>{t('simpleDescription')}</p>
        </div>
        <span className="sm-rule-pill">
          {selected?.published ? t('published') : t('draftPending')}
        </span>
      </header>

      {error ? (
        <p className="sm-rule-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="sm-rule-success" role="status">
          {message}
        </p>
      ) : null}

      <section className="sm-rule-panel sm-rule-simple-card">
        {records.length ? (
          <label className="sm-rule-simple-saved">
            {t('savedRuleOptional')}
            <select
              value={selectedId ?? ''}
              onChange={(event) => {
                const record = records.find((item) => item.id === event.target.value);
                if (record) selectRecord(record);
                else newRule();
              }}
            >
              <option value="">{t('newRule')}</option>
              {records.map((record) => (
                <option key={record.id} value={record.id}>
                  {savedRuleLabel(record)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="sm-rule-simple-grid">
          <label>
            {t('appliesTo')}
            <select
              value={selectedTarget}
              disabled={loading}
              onChange={(event) => {
                setSelectedTarget(event.target.value);
                setSelectedId(null);
              }}
            >
              {targets.map((target) => (
                <option key={targetKey(target.scope, target.id)} value={targetKey(target.scope, target.id)}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('rule')}
            <select value={code} onChange={(event) => showCode(event.target.value as ManagedRuleCode)}>
              {MANAGED_RULE_CODES.map((item) => (
                <option key={item} value={item}>
                  {ruleTitle(item)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sm-rule-simple-explanation">
          <strong>{ruleTitle(code)}</strong>
          <span>{String(t.raw(('ruleHelp.' + code) as Parameters<typeof t.raw>[0]))}</span>
        </div>

        <div className="sm-rule-form-grid">
          {PARAMS[code].map((field) => (
            <label key={field.key}>
              {parameterLabel(field.key)} ({field.unit})
              <input
                type="number"
                min={0}
                step="any"
                value={String(parameters[field.key] ?? 0)}
                onChange={(event) =>
                  setParameters((current) => ({
                    ...current,
                    [field.key]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
          <label>
            {t('severity')}
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as AlarmSeverity)}
            >
              <option value="INFO">{t('info')}</option>
              <option value="WARNING">{t('warning')}</option>
              <option value="CRITICAL">{t('critical')}</option>
            </select>
          </label>
        </div>

        <p className="sm-rule-note">{t('draftDefaultsNote')}</p>
        {code === 'LOAD_LOSS' || code === 'NO_ENERGY_INCREMENT' ? (
          <p className="sm-rule-note">{t('expectedLoadWarning')}</p>
        ) : null}

        <details className="sm-rule-advanced">
          <summary>{t('advancedSettings')}</summary>
          <div className="sm-rule-form-grid">
            <label>
              {t('debounce')}
              <input
                type="number"
                min={1}
                max={30}
                value={debounce}
                onChange={(event) => setDebounce(Number(event.target.value))}
              />
            </label>
            <label>
              {t('recovery')}
              <input
                type="number"
                min={1}
                max={30}
                value={recovery}
                onChange={(event) => setRecovery(Number(event.target.value))}
              />
            </label>
          </div>
        </details>

        <div className="sm-rule-actions sm-rule-simple-actions">
          <button className="sm-rule-primary" type="button" onClick={save} disabled={!canEdit || busy || loading}>
            {t('saveDraft')}
          </button>
          {selected ? (
            <button className="sm-rule-publish" type="button" onClick={() => change('PUBLISH')} disabled={!canEdit || busy}>
              {t('publish')}
            </button>
          ) : null}
          {selected?.published ? (
            <button className="sm-rule-disable" type="button" onClick={() => change('DISABLE')} disabled={!canEdit || busy}>
              {t('disable')}
            </button>
          ) : null}
        </div>

        {!canEdit ? <p className="sm-rule-note">{t('readOnlyNote')}</p> : null}
      </section>
    </section>
  );
}
