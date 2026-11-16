'use client';

import Link from 'next/link';
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
    { key: 'assertBelowV', label: 'Assert ≤', unit: 'V', defaultValue: 0 },
    { key: 'clearAboveV', label: 'Recover ≥', unit: 'V', defaultValue: 0 },
  ],
  HIGH_VOLTAGE: [
    { key: 'assertAboveV', label: 'Assert ≥', unit: 'V', defaultValue: 0 },
    { key: 'clearBelowV', label: 'Recover ≤', unit: 'V', defaultValue: 0 },
  ],
  VOLTAGE_LOSS: [
    { key: 'zeroToleranceV', label: 'Zero tolerance', unit: 'V', defaultValue: 0 },
    { key: 'clearAboveV', label: 'Recover above', unit: 'V', defaultValue: 0 },
  ],
  LOW_CURRENT: [
    { key: 'assertBelowA', label: 'Assert ≤', unit: 'A', defaultValue: 0 },
    { key: 'clearAboveA', label: 'Recover ≥', unit: 'A', defaultValue: 0 },
  ],
  LOAD_LOSS: [
    { key: 'zeroToleranceA', label: 'Zero tolerance', unit: 'A', defaultValue: 0 },
    { key: 'referenceMinA', label: 'Expected minimum', unit: 'A', defaultValue: 0 },
  ],
  SUDDEN_CURRENT_DROP: [
    { key: 'referenceCurrentA', label: 'Reference current', unit: 'A', defaultValue: 0 },
    { key: 'dropPercent', label: 'Assert drop', unit: '%', defaultValue: 0 },
    { key: 'clearDropPercent', label: 'Recover below', unit: '%', defaultValue: 0 },
  ],
  LOW_POWER: [
    { key: 'assertBelowW', label: 'Assert ≤', unit: 'W', defaultValue: 0 },
    { key: 'clearAboveW', label: 'Recover ≥', unit: 'W', defaultValue: 0 },
  ],
  HIGH_POWER: [
    { key: 'assertAboveW', label: 'Assert ≥', unit: 'W', defaultValue: 0 },
    { key: 'clearBelowW', label: 'Recover ≤', unit: 'W', defaultValue: 0 },
  ],
  NO_ENERGY_INCREMENT: [
    { key: 'maxDeltaKwh', label: 'Max non-increment', unit: 'kWh', defaultValue: 0 },
    { key: 'windowMs', label: 'Observation window', unit: 'ms', defaultValue: 300000 },
  ],
  ENERGY_COUNTER_RESET: [
    { key: 'minDecrementKwh', label: 'Minimum decrement', unit: 'kWh', defaultValue: 0 },
  ],
  ENERGY_CONSUMPTION_ANOMALY: [
    { key: 'minDeltaKwh', label: 'Minimum increment', unit: 'kWh', defaultValue: 0 },
    { key: 'maxDeltaKwh', label: 'Maximum increment', unit: 'kWh', defaultValue: 0 },
    { key: 'windowMs', label: 'Observation window', unit: 'ms', defaultValue: 300000 },
  ],
};
const titles: Record<ManagedRuleCode, string> = {
  LOW_VOLTAGE: 'Low Voltage',
  HIGH_VOLTAGE: 'High Voltage',
  VOLTAGE_LOSS: 'Voltage Loss',
  LOW_CURRENT: 'Low Current',
  LOAD_LOSS: 'Load Loss',
  SUDDEN_CURRENT_DROP: 'Sudden Current Drop',
  LOW_POWER: 'Low Power',
  HIGH_POWER: 'High Power',
  NO_ENERGY_INCREMENT: 'No Energy Increment',
  ENERGY_COUNTER_RESET: 'Energy Counter Reset',
  ENERGY_CONSUMPTION_ANOMALY: 'Energy Consumption Anomaly',
};
const profileItems = [
  ['Nominal voltage', 'nominalVoltageV', 'V'],
  ['Battery cells', 'batteryCells', 'cells'],
  ['Rectifier OVS', 'rectifierOvsV', 'V'],
  ['Reference voltage', 'referenceVoltageV', 'V'],
  ['Boost voltage', 'boostVoltageV', 'V'],
  ['Rectifier standby', 'rectifierStandbyVoltageV', 'V'],
  ['Battery disconnect', 'batteryDisconnectVoltageV', 'V'],
  ['Battery reconnect', 'batteryReconnectVoltageV', 'V'],
  ['Battery test end', 'batteryTestEndVoltageV', 'V'],
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
    if (!response.ok) throw new Error('Cannot load Rule Manager');
    const body = (await response.json()) as { records: ManagedRuleRecord[] };
    setRecords(body.records);
  }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetch('/api/alarms/rules', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cannot load Rule Manager');
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
  }, []);
  useEffect(() => {
    if (!initialBreakerId) return;
    const controller = new AbortController();
    void fetch('/api/alarms/rules/effective?breakerId=' + encodeURIComponent(initialBreakerId), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Breaker policy unavailable');
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
  }, [initialBreakerId]);

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
      if (!response.ok) throw new Error(body.error || 'Rule change rejected');
      await reload();
      if (body.record) setSelectedId(body.record.id);
      setMessage('Change saved on the working branch database. Policy history updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
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
    if (
      action === 'PUBLISH' &&
      !window.confirm(
        'Publish this electrical rule? All matching commissioned breakers may be affected.',
      )
    )
      return;
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
      if (!resp.ok) throw new Error('Unable to inspect breaker policy');
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
          <small>OPERATIONS / ALARMS / RULE MANAGER</small>
          <h1>Alarm Rules</h1>
          <p>Published policies · Electrical profiles · Breaker overrides</p>
        </div>
        <Link href="/alarms">← Alarm Center</Link>
      </header>
      <div className="sm-rule-kpis">
        <article>
          <small>Rule catalog</small>
          <strong>{MANAGED_RULE_CODES.length}</strong>
          <span>V/A/P/E definitions</span>
        </article>
        <article>
          <small>Published</small>
          <strong>{published.length}</strong>
          <span>Commissioned scopes</span>
        </article>
        <article>
          <small>Drafts</small>
          <strong>{records.filter((r) => r.draft.status === 'DRAFT').length}</strong>
          <span>Unpublished changes</span>
        </article>
        <article>
          <small>DC profile</small>
          <strong>48 V</strong>
          <span>24 cells · Reference 54.5 V</span>
        </article>
      </div>
      <nav className="sm-rule-tabs" aria-label="Rule manager views">
        {(['RULES', 'PROFILES', 'ASSIGNMENTS', 'HISTORY'] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => setView(tab)} aria-pressed={view === tab}>
            {
              {
                RULES: 'Rule Catalog',
                PROFILES: 'Electrical Profiles',
                ASSIGNMENTS: 'Assignments',
                HISTORY: 'Policy History',
              }[tab]
            }
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
      {loading ? <p>Loading policies…</p> : null}
      {view === 'PROFILES' ? (
        <section className="sm-rule-panel">
          <div className="sm-rule-panel-head">
            <div>
              <h2>DC-48V-24CELL</h2>
              <p>Rectifier settings · 24 battery cells</p>
            </div>
            <span className="sm-rule-pill">Reference only</span>
          </div>
          <div className="sm-rule-profile-grid">
            {profileItems.map(([title, key, unit]) => (
              <article key={key}>
                <small>{title}</small>
                <strong>
                  {DEFAULT_DC_PROFILE[key]} {unit}
                </strong>
              </article>
            ))}
          </div>
          <p>
            These are measured equipment configuration references, not commissioned breaker alarm
            thresholds. An operator must approve each alarm limit before publishing the
            corresponding rule.
          </p>
        </section>
      ) : null}
      {view === 'RULES' ? (
        <div className="sm-rule-layout">
          <section className="sm-rule-panel">
            <div className="sm-rule-panel-head">
              <h2>Rule Catalog</h2>
              <select
                value={metric}
                aria-label="Filter metric"
                onChange={(e) => setMetric(e.target.value as Metric)}
              >
                {(['ALL', 'V', 'A', 'P', 'E'] as const).map((m) => (
                  <option key={m} value={m}>
                    {m === 'ALL' ? 'All metrics' : m}
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
                      <b>{titles[c]}</b>
                      <small>
                        {c} · {ruleMetric(c)}
                      </small>
                    </span>
                    <em>{count} active</em>
                  </button>
                );
              })}
            </div>
            <h3>Saved configurations</h3>
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
                      <b>{titles[r.draft.code]}</b>
                      <small>
                        {r.draft.scope} · {r.draft.scopeId ?? 'All breakers'}
                      </small>
                    </span>
                    <em>{r.published ? 'Published' : 'Draft'}</em>
                  </button>
                ))}
              {records.length === 0 ? (
                <p>No managed rules saved yet. Existing alarm policies remain unaffected.</p>
              ) : null}
            </div>
          </section>
          <section className="sm-rule-panel sm-rule-inspector">
            <div className="sm-rule-panel-head">
              <div>
                <small>RULE INSPECTOR</small>
                <h2>{titles[code]}</h2>
                <p>
                  {code} · {ruleMetric(code)}
                </p>
              </div>
              <span className="sm-rule-pill">
                {selected?.published ? 'Published' : 'Draft / Pending'}
              </span>
            </div>
            <div className="sm-rule-form">
              <label>
                Scope
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value as RuleScope);
                    setSelectedId(null);
                  }}
                >
                  <option value="GLOBAL">Global</option>
                  <option value="QDF">QDF / Device</option>
                  <option value="PANEL">Panel</option>
                  <option value="BREAKER">Breaker</option>
                </select>
              </label>
              {scope !== 'GLOBAL' ? (
                <label>
                  Canonical {scope.toLowerCase()} ID
                  <input
                    value={scopeId}
                    onChange={(e) => {
                      setScopeId(e.target.value);
                      setSelectedId(null);
                    }}
                    placeholder="Topology entity ID"
                  />
                </label>
              ) : null}
              <div className="sm-rule-form-grid">
                {PARAMS[code].map((f) => (
                  <label key={f.key}>
                    {f.label} ({f.unit})
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
                  Severity
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as AlarmSeverity)}
                  >
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
                <label>
                  Confirm samples
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={debounce}
                    onChange={(e) => setDebounce(Number(e.target.value))}
                  />
                </label>
                <label>
                  Recovery samples
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={recovery}
                    onChange={(e) => setRecovery(Number(e.target.value))}
                  />
                </label>
              </div>
              {code === 'LOAD_LOSS' || code === 'NO_ENERGY_INCREMENT' ? (
                <p className="sm-rule-note">
                  Expected load is required and must be commissioned. A zero reading alone does not
                  prove breaker trip.
                </p>
              ) : null}
              {code === 'LOAD_LOSS' ? (
                <div className="sm-rule-simulator">
                  <h3>Load Loss · Dry-run preview</h3>
                  <div className="sm-rule-form-grid">
                    <label>
                      Prior current (A)
                      <input
                        type="number"
                        value={simPrevious}
                        onChange={(e) => setSimPrevious(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Current reading (A)
                      <input
                        type="number"
                        value={simCurrent}
                        onChange={(e) => setSimCurrent(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <span className={loadLossCandidate ? 'sm-rule-test-alert' : 'sm-rule-test-ok'}>
                    {loadLossCandidate ? 'Candidate: LOAD_LOSS' : 'No Load Loss candidate'}
                  </span>
                  <p>
                    Preview only. Real alarms also require accepted telemetry, expected-load
                    commissioning and debounce.
                  </p>
                </div>
              ) : null}
              <div className="sm-rule-actions">
                <button type="button" onClick={save} disabled={!canEdit || busy}>
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={() => change('PUBLISH')}
                  disabled={!canEdit || busy || !selected}
                >
                  Publish
                </button>
                <button
                  type="button"
                  onClick={() => change('DISABLE')}
                  disabled={!canEdit || busy || !selected || !selected.published}
                >
                  Disable
                </button>
              </div>
              {!canEdit ? (
                <p className="sm-rule-note">
                  Read-only: policy changes require settings:write permission.
                </p>
              ) : null}
              {selected?.published ? (
                <p className="sm-rule-note">
                  A published snapshot stays active while draft changes are edited. Publish again to
                  replace it.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {view === 'ASSIGNMENTS' ? (
        <section className="sm-rule-panel">
          <h2>Published Assignments</h2>
          <p>
            Published policies resolve from Global → QDF/Device → Panel → Breaker. Existing policies
            take precedence for their alarm code.
          </p>
          <div className="sm-rule-table-wrap">
            <table className="sm-rule-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Scope</th>
                  <th>Target</th>
                  <th>Revision</th>
                </tr>
              </thead>
              <tbody>
                {published.map((r) => (
                  <tr key={r.id}>
                    <td>{r.published?.code}</td>
                    <td>{r.published?.scope}</td>
                    <td>{r.published?.scopeId ?? 'Global'}</td>
                    <td>{r.published?.revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Effective breaker policy</h3>
          <div className="sm-rule-preview">
            <input
              aria-label="Breaker ID"
              placeholder="Breaker topology ID"
              value={previewId}
              onChange={(e) => setPreviewId(e.target.value)}
            />
            <button type="button" onClick={() => void loadEffective()} disabled={!previewId}>
              Inspect breaker
            </button>
          </div>
          {preview ? (
            <div className="sm-rule-table-wrap">
              <table className="sm-rule-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>Origin</th>
                    <th>Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rules.map((r, i) => (
                    <tr key={r.code + '-' + i}>
                      <td>{r.code}</td>
                      <td>{r.source}</td>
                      <td>{r.scope}</td>
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
          <h2>Policy History</h2>
          <div className="sm-rule-table-wrap">
            <table className="sm-rule-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Rule</th>
                  <th>Action</th>
                  <th>Revision</th>
                  <th>Operator</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.occurredAt).toLocaleString()}</td>
                    <td>{a.snapshot.code}</td>
                    <td>{a.action}</td>
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
