'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AlarmSeverity } from '@/modules/alarm/domain/entities';
import {
  DEFAULT_DC_PROFILE,
  MANAGED_RULE_CODES,
  ruleMetric,
  type ManagedRuleCode,
  type RuleScope,
} from '@/modules/alarm/domain/rule-manager';
import type { ManagedRuleRecord } from '@/modules/alarm/infrastructure/rule-manager-store';

type View = 'RULES' | 'PROFILES' | 'ASSIGNMENTS' | 'HISTORY';
type Metric = 'ALL' | 'V' | 'A' | 'P' | 'E';
type InputField = Readonly<{ key: string; label: string; unit: string; defaultValue: number }>;
const PARAMS: Readonly<Record<ManagedRuleCode, readonly InputField[]>> = {
  LOW_VOLTAGE: [
    { key: 'assertBelowV', label: 'Assert ≤', unit: 'V', defaultValue: 45.5 },
    { key: 'clearAboveV', label: 'Recover ≥', unit: 'V', defaultValue: 48 },
  ],
  HIGH_VOLTAGE: [
    { key: 'assertAboveV', label: 'Assert ≥', unit: 'V', defaultValue: 56.5 },
    { key: 'clearBelowV', label: 'Recover ≤', unit: 'V', defaultValue: 54.5 },
  ],
  VOLTAGE_LOSS: [
    { key: 'zeroToleranceV', label: 'Zero tolerance', unit: 'V', defaultValue: 1 },
    { key: 'clearAboveV', label: 'Recover above', unit: 'V', defaultValue: 43 },
  ],
  LOW_CURRENT: [
    { key: 'assertBelowA', label: 'Assert ≤', unit: 'A', defaultValue: 0.5 },
    { key: 'clearAboveA', label: 'Recover ≥', unit: 'A', defaultValue: 1 },
  ],
  LOAD_LOSS: [
    { key: 'zeroToleranceA', label: 'Zero tolerance', unit: 'A', defaultValue: 0.2 },
    { key: 'referenceMinA', label: 'Expected minimum', unit: 'A', defaultValue: 1 },
  ],
  SUDDEN_CURRENT_DROP: [
    { key: 'referenceCurrentA', label: 'Reference current', unit: 'A', defaultValue: 8.4 },
    { key: 'dropPercent', label: 'Assert drop', unit: '%', defaultValue: 50 },
    { key: 'clearDropPercent', label: 'Recover below', unit: '%', defaultValue: 25 },
  ],
  LOW_POWER: [
    { key: 'assertBelowW', label: 'Assert ≤', unit: 'W', defaultValue: 25 },
    { key: 'clearAboveW', label: 'Recover ≥', unit: 'W', defaultValue: 50 },
  ],
  HIGH_POWER: [
    { key: 'assertAboveW', label: 'Assert ≥', unit: 'W', defaultValue: 2500 },
    { key: 'clearBelowW', label: 'Recover ≤', unit: 'W', defaultValue: 2000 },
  ],
  NO_ENERGY_INCREMENT: [
    { key: 'maxDeltaKwh', label: 'Max non-increment', unit: 'kWh', defaultValue: 0.001 },
    { key: 'windowMs', label: 'Observation window', unit: 'ms', defaultValue: 300000 },
  ],
  ENERGY_COUNTER_RESET: [
    { key: 'minDecrementKwh', label: 'Minimum decrement', unit: 'kWh', defaultValue: 0.001 },
  ],
  ENERGY_CONSUMPTION_ANOMALY: [
    { key: 'minDeltaKwh', label: 'Minimum increment', unit: 'kWh', defaultValue: 0.001 },
    { key: 'maxDeltaKwh', label: 'Maximum increment', unit: 'kWh', defaultValue: 5 },
    { key: 'windowMs', label: 'Observation window', unit: 'ms', defaultValue: 300000 },
  ],
};
const profileItems = [
  ['profileNominalVoltage', 'nominalVoltageV', 'V'],
  ['profileBatteryCells', 'batteryCells', 'cells'],
  ['profileRectifierOvs', 'rectifierOvsV', 'V'],
  ['profileReferenceVoltage', 'referenceVoltageV', 'V'],
  ['profileBoostVoltage', 'boostVoltageV', 'V'],
  ['profileRectifierStandby', 'rectifierStandbyVoltageV', 'V'],
  ['profileBatteryDisconnect', 'batteryDisconnectVoltageV', 'V'],
  ['profileBatteryReconnect', 'batteryReconnectVoltageV', 'V'],
  ['profileBatteryTestEnd', 'batteryTestEndVoltageV', 'V'],
] as const;

function defaults(code: ManagedRuleCode): Record<string, number | boolean> {
  const params: Record<string, number | boolean> = Object.fromEntries(
    PARAMS[code].map((f) => [f.key, f.defaultValue]),
  );
  if (code === 'LOAD_LOSS' || code === 'NO_ENERGY_INCREMENT') params.expectedLoad = true;
  return params;
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
  const profileLabel = (key: string) => String(t.raw(key as Parameters<typeof t.raw>[0]));
  const viewLabel = (value: View) =>
    ({
      RULES: t('ruleCatalogTab'),
      PROFILES: t('electricalProfilesTab'),
      ASSIGNMENTS: t('assignmentsTab'),
      HISTORY: t('policyHistoryTab'),
    })[value];
  const scopeLabel = (value: string) =>
    ({
      GLOBAL: t('global'),
      QDF: t('qdfDevice'),
      PANEL: t('panel'),
      BREAKER: t('breaker'),
    })[value] ?? value;
  const actionLabel = (value: string) =>
    ({
      CREATED: t('actionCreated'),
      DRAFT_UPDATED: t('actionDraftUpdated'),
      PUBLISHED: t('actionPublished'),
      DISABLED: t('actionDisabled'),
    })[value] ?? value;
  const displayRule = (value: string) =>
    MANAGED_RULE_CODES.includes(value as ManagedRuleCode)
      ? ruleTitle(value as ManagedRuleCode)
      : value;
  const [view, setView] = useState<View>(initialBreakerId ? 'ASSIGNMENTS' : 'RULES');
  const [metric, setMetric] = useState<Metric>('ALL');
  const [records, setRecords] = useState<readonly ManagedRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState<ManagedRuleCode>('LOAD_LOSS');
  const [scope, setScope] = useState<RuleScope>('BREAKER');
  const [scopeId, setScopeId] = useState(initialBreakerId);
  const [severity, setSeverity] = useState<AlarmSeverity>('WARNING');
  const [debounce, setDebounce] = useState(3);
  const [recovery, setRecovery] = useState(2);
  const [parameters, setParameters] = useState<Record<string, number | boolean>>(() =>
    defaults('LOAD_LOSS'),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState(initialBreakerId);
  const [preview, setPreview] = useState<{
    rules: readonly { code: string; source: string; scope: string }[];
  } | null>(null);
  const [simPrevious, setSimPrevious] = useState(8.4);
  const [simCurrent, setSimCurrent] = useState(0);

  const reload = useCallback(async () => {
    const response = await fetch('/api/alarms/rules', { cache: 'no-store' });
    if (!response.ok) throw new Error(t('loadManagerError'));
    const body = (await response.json()) as { records: ManagedRuleRecord[] };
    setRecords(body.records);
  }, [t]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch('/api/alarms/rules', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('loadManagerError'));
        const body = (await response.json()) as { records: ManagedRuleRecord[] };
        if (active) setRecords(body.records);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [t]);
  useEffect(() => {
    if (!initialBreakerId) return;
    const controller = new AbortController();
    void fetch('/api/alarms/rules/effective?breakerId=' + encodeURIComponent(initialBreakerId), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t('breakerPolicyUnavailable'));
        setPreview(
          (await response.json()) as {
            rules: readonly { code: string; source: string; scope: string }[];
          },
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, [initialBreakerId, t]);

  const selected = records.find((r) => r.id === selectedId) || null;
  const filtered = MANAGED_RULE_CODES.filter((c) => metric === 'ALL' || ruleMetric(c) === metric);
  const published = records.filter((r) => Boolean(r.published));
  const audits = useMemo(
    () =>
      records
        .flatMap((r) => r.audit)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 150),
    [records],
  );
  const loadLossCandidate =
    code === 'LOAD_LOSS' &&
    simPrevious >= Number(parameters.referenceMinA) &&
    simPrevious > 0 &&
    simCurrent <= Number(parameters.zeroToleranceA);
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
  const selectRecord = (record: ManagedRuleRecord) => {
    const d = record.draft;
    setSelectedId(record.id);
    setCode(d.code);
    setScope(d.scope);
    setScopeId(d.scopeId ?? '');
    setSeverity(d.severity);
    setDebounce(d.debounceSamples);
    setRecovery(d.recoverySamples);
    setParameters({ ...d.parameters });
    setMessage('');
    setError('');
    setView('RULES');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unexpectedError'));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    void post({
      action: 'SAVE_DRAFT',
      rule: {
        ...(selected ? { id: selected.id, expectedRevision: selected.revision } : {}),
        code,
        scope,
        scopeId: scope === 'GLOBAL' ? null : scopeId.trim(),
        electricalProfileId: DEFAULT_DC_PROFILE.id,
        parameters,
        severity,
        debounceSamples: debounce,
        recoverySamples: recovery,
      },
    });
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
  const loadEffective = async () => {
    setError('');
    try {
      const resp = await fetch(
        '/api/alarms/rules/effective?breakerId=' + encodeURIComponent(previewId),
        { cache: 'no-store' },
      );
      if (!resp.ok) throw new Error(t('inspectPolicyError'));
      setPreview(
        (await resp.json()) as {
          rules: readonly { code: string; source: string; scope: string }[];
        },
      );
    } catch (err) {
      setError(String(err));
      setPreview(null);
    }
  };

  return (
    <section className="sm-rule-manager">
      <header className="sm-rule-head">
        <div>
          <small>{t('eyebrow')}</small>
          <h1>{t('alarmRules')}</h1>
          <p>{t('description')}</p>
        </div>
        <Link href="/alarms">{t('backToCenter')}</Link>
      </header>
      <div className="sm-rule-kpis">
        <article>
          <small>{t('catalogShort')}</small>
          <strong>{MANAGED_RULE_CODES.length}</strong>
          <span>{t('vipeDefinitions')}</span>
        </article>
        <article>
          <small>{t('published')}</small>
          <strong>{published.length}</strong>
          <span>{t('commissionedScopes')}</span>
        </article>
        <article>
          <small>{t('drafts')}</small>
          <strong>{records.filter((r) => r.draft.status === 'DRAFT').length}</strong>
          <span>{t('unpublishedChanges')}</span>
        </article>
        <article>
          <small>{t('dcProfile')}</small>
          <strong>{t('nominal48')}</strong>
          <span>{t('dcShortSummary')}</span>
        </article>
      </div>
      <nav className="sm-rule-tabs" aria-label={t('viewsLabel')}>
        {(['RULES', 'PROFILES', 'ASSIGNMENTS', 'HISTORY'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setView(tab)} aria-pressed={view === tab}>
            {viewLabel(tab)}
          </button>
        ))}
      </nav>
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
      {loading ? <p>{t('loadingPolicies')}</p> : null}
      {view === 'PROFILES' ? (
        <section className="sm-rule-panel">
          <div className="sm-rule-panel-head">
            <div>
              <h2>{t('profileId')}</h2>
              <p>{t('rectifierSettings')}</p>
            </div>
            <span className="sm-rule-pill">{t('referenceOnly')}</span>
          </div>
          <div className="sm-rule-profile-grid">
            {profileItems.map(([title, key, unit]) => (
              <article key={key}>
                <small>{profileLabel(title)}</small>
                <strong>
                  {DEFAULT_DC_PROFILE[key]} {unit === 'cells' ? t('cellsUnit') : unit}
                </strong>
              </article>
            ))}
          </div>
          <p>{t('profileWarning')}</p>
        </section>
      ) : null}
      {view === 'RULES' ? (
        <div className="sm-rule-layout">
          <section className="sm-rule-panel">
            <div className="sm-rule-panel-head">
              <h2>{t('ruleCatalog')}</h2>
              <select
                value={metric}
                aria-label={t('filterMetric')}
                onChange={(e) => setMetric(e.target.value as Metric)}
              >
                {(['ALL', 'V', 'A', 'P', 'E'] as const).map((m) => (
                  <option key={m} value={m}>
                    {m === 'ALL' ? t('allMetrics') : m}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm-rule-list">
              {filtered.map((c) => {
                const count = published.filter((r) => r.published?.code === c).length;
                return (
                  <button
                    key={c}
                    type="button"
                    className={code === c ? 'selected' : ''}
                    onClick={() => showCode(c)}
                  >
                    <span>
                      <b>{ruleTitle(c)}</b>
                      <small>
                        {c} · {ruleMetric(c)}
                      </small>
                    </span>
                    <em>
                      {count} {t('active')}
                    </em>
                  </button>
                );
              })}
            </div>
            <h3>{t('savedConfigurations')}</h3>
            <div className="sm-rule-list">
              {records
                .filter((r) => metric === 'ALL' || ruleMetric(r.draft.code) === metric)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => selectRecord(r)}
                    className={selectedId === r.id ? 'selected' : ''}
                  >
                    <span>
                      <b>{ruleTitle(r.draft.code)}</b>
                      <small>
                        {scopeLabel(r.draft.scope)} · {r.draft.scopeId ?? t('allBreakers')}
                      </small>
                    </span>
                    <em>{r.published ? t('published') : t('draft')}</em>
                  </button>
                ))}
              {records.length === 0 ? <p>{t('noRules')}</p> : null}
            </div>
          </section>
          <section className="sm-rule-panel sm-rule-inspector">
            <div className="sm-rule-panel-head">
              <div>
                <small>{t('inspector')}</small>
                <h2>{ruleTitle(code)}</h2>
                <p>
                  {code} · {ruleMetric(code)}
                </p>
              </div>
              <span className="sm-rule-pill">
                {selected?.published ? t('published') : t('draftPending')}
              </span>
            </div>
            <div className="sm-rule-form">
              <label>
                {t('scope')}
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value as RuleScope);
                    setSelectedId(null);
                  }}
                >
                  <option value="GLOBAL">{t('global')}</option>
                  <option value="QDF">{t('qdfDevice')}</option>
                  <option value="PANEL">{t('panel')}</option>
                  <option value="BREAKER">{t('breaker')}</option>
                </select>
              </label>
              {scope !== 'GLOBAL' ? (
                <label>
                  {t('canonical')} {scopeLabel(scope)} {t('idLabel')}
                  <input
                    value={scopeId}
                    onChange={(e) => {
                      setScopeId(e.target.value);
                      setSelectedId(null);
                    }}
                    placeholder={t('topologyIdPlaceholder')}
                  />
                </label>
              ) : null}
              <div className="sm-rule-form-grid">
                {PARAMS[code].map((f) => (
                  <label key={f.key}>
                    {parameterLabel(f.key)} ({f.unit})
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={String(parameters[f.key] ?? 0)}
                      onChange={(e) =>
                        setParameters((old) => ({ ...old, [f.key]: Number(e.target.value) }))
                      }
                    />
                  </label>
                ))}
                <label>
                  {t('severity')}
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as AlarmSeverity)}
                  >
                    <option value="INFO">{t('info')}</option>
                    <option value="WARNING">{t('warning')}</option>
                    <option value="CRITICAL">{t('critical')}</option>
                  </select>
                </label>
                <label>
                  {t('debounce')}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={debounce}
                    onChange={(e) => setDebounce(Number(e.target.value))}
                  />
                </label>
                <label>
                  {t('recovery')}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={recovery}
                    onChange={(e) => setRecovery(Number(e.target.value))}
                  />
                </label>
              </div>
              <p className="sm-rule-note">{t('draftDefaultsNote')}</p>
              {code === 'LOAD_LOSS' || code === 'NO_ENERGY_INCREMENT' ? (
                <p className="sm-rule-note">{t('expectedLoadWarning')}</p>
              ) : null}
              {code === 'LOAD_LOSS' ? (
                <div className="sm-rule-simulator">
                  <h3>{t('loadLossSimulator')}</h3>
                  <div className="sm-rule-form-grid">
                    <label>
                      {t('previousCurrent')}
                      <input
                        type="number"
                        value={simPrevious}
                        onChange={(e) => setSimPrevious(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      {t('currentReading')}
                      <input
                        type="number"
                        value={simCurrent}
                        onChange={(e) => setSimCurrent(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <span className={loadLossCandidate ? 'sm-rule-test-alert' : 'sm-rule-test-ok'}>
                    {loadLossCandidate ? t('loadLossCandidate') : t('noLoadLossCandidate')}
                  </span>
                  <p>{t('simulatorWarning')}</p>
                </div>
              ) : null}
              <div className="sm-rule-actions">
                <button type="button" onClick={save} disabled={!canEdit || busy}>
                  {t('saveDraft')}
                </button>
                <button
                  type="button"
                  onClick={() => change('PUBLISH')}
                  disabled={!canEdit || busy || !selected}
                >
                  {t('publish')}
                </button>
                <button
                  type="button"
                  onClick={() => change('DISABLE')}
                  disabled={!canEdit || busy || !selected || !selected.published}
                >
                  {t('disable')}
                </button>
              </div>
              {!canEdit ? <p className="sm-rule-note">{t('readOnlyNote')}</p> : null}
              {selected?.published ? (
                <p className="sm-rule-note">{t('publishedSnapshotNote')}</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {view === 'ASSIGNMENTS' ? (
        <section className="sm-rule-panel">
          <h2>{t('publishedAssignments')}</h2>
          <p>{t('inheritanceNote')}</p>
          <div className="sm-rule-table-wrap">
            <table className="sm-rule-table">
              <thead>
                <tr>
                  <th>{t('rule')}</th>
                  <th>{t('scope')}</th>
                  <th>{t('target')}</th>
                  <th>{t('revision')}</th>
                </tr>
              </thead>
              <tbody>
                {published.map((r) => (
                  <tr key={r.id}>
                    <td>{r.published ? displayRule(r.published.code) : ''}</td>
                    <td>{r.published ? scopeLabel(r.published.scope) : ''}</td>
                    <td>{r.published?.scopeId ?? t('global')}</td>
                    <td>{r.published?.revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{t('effectiveBreaker')}</h3>
          <div className="sm-rule-preview">
            <input
              aria-label={t('breakerIdLabel')}
              placeholder={t('breakerIdPlaceholder')}
              value={previewId}
              onChange={(e) => setPreviewId(e.target.value)}
            />
            <button type="button" onClick={() => void loadEffective()} disabled={!previewId}>
              {t('inspectBreaker')}
            </button>
          </div>
          {preview ? (
            <div className="sm-rule-table-wrap">
              <table className="sm-rule-table">
                <thead>
                  <tr>
                    <th>{t('rule')}</th>
                    <th>{t('origin')}</th>
                    <th>{t('scope')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rules.map((r, i) => (
                    <tr key={r.code + '-' + i}>
                      <td>{displayRule(r.code)}</td>
                      <td>{r.source}</td>
                      <td>{scopeLabel(r.scope)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
      {view === 'HISTORY' ? (
        <section className="sm-rule-panel">
          <h2>{t('policyHistory')}</h2>
          <div className="sm-rule-table-wrap">
            <table className="sm-rule-table">
              <thead>
                <tr>
                  <th>{t('when')}</th>
                  <th>{t('rule')}</th>
                  <th>{t('action')}</th>
                  <th>{t('revision')}</th>
                  <th>{t('operator')}</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.occurredAt).toLocaleString()}</td>
                    <td>{displayRule(a.snapshot.code)}</td>
                    <td>{actionLabel(a.action)}</td>
                    <td>{a.revision}</td>
                    <td>{a.actorId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
