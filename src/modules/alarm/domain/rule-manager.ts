import type { AlarmSeverity } from '@/modules/alarm/domain/entities';

export type RuleScope = 'GLOBAL' | 'QDF' | 'PANEL' | 'BREAKER';
export type RuleStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED';
export type ManagedRuleCode =
  | 'LOW_VOLTAGE'
  | 'HIGH_VOLTAGE'
  | 'VOLTAGE_LOSS'
  | 'LOW_CURRENT'
  | 'LOAD_LOSS'
  | 'SUDDEN_CURRENT_DROP'
  | 'LOW_POWER'
  | 'HIGH_POWER'
  | 'NO_ENERGY_INCREMENT'
  | 'ENERGY_COUNTER_RESET'
  | 'ENERGY_CONSUMPTION_ANOMALY';

export const MANAGED_RULE_CODES: readonly ManagedRuleCode[] = [
  'LOW_VOLTAGE',
  'HIGH_VOLTAGE',
  'VOLTAGE_LOSS',
  'LOW_CURRENT',
  'LOAD_LOSS',
  'SUDDEN_CURRENT_DROP',
  'LOW_POWER',
  'HIGH_POWER',
  'NO_ENERGY_INCREMENT',
  'ENERGY_COUNTER_RESET',
  'ENERGY_CONSUMPTION_ANOMALY',
] as const;

/** Rectifier settings as observed in the supplied screenshot, not commissioned alarm limits. */
export const DEFAULT_DC_PROFILE = {
  id: 'DC-48V-24CELL',
  name: '48 V DC / 24-cell telecom',
  nominalVoltageV: 48,
  batteryCells: 24,
  rectifierOvsV: 59,
  referenceVoltageV: 54.5,
  boostVoltageV: 56.5,
  rectifierStandbyVoltageV: 44.4,
  batteryDisconnectVoltageV: 43,
  batteryReconnectVoltageV: 48,
  batteryTestEndVoltageV: 45.5,
  source: 'RECTIFIER_CONFIGURATION_SCREENSHOT',
  voltageLimitsCommissioned: false,
} as const;

export interface ManagedAlarmRule {
  readonly id: string;
  readonly code: ManagedRuleCode;
  readonly scope: RuleScope;
  readonly scopeId: string | null;
  readonly electricalProfileId: string;
  readonly parameters: Readonly<Record<string, number | boolean>>;
  readonly severity: AlarmSeverity;
  readonly debounceSamples: number;
  readonly recoverySamples: number;
  readonly status: RuleStatus;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export interface ManagedRuleAudit {
  readonly id: string;
  readonly ruleId: string;
  readonly action: 'CREATED' | 'DRAFT_UPDATED' | 'PUBLISHED' | 'DISABLED';
  readonly revision: number;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly snapshot: ManagedAlarmRule;
}

export interface RuleDraftInput {
  readonly id?: string;
  readonly expectedRevision?: number;
  readonly code: ManagedRuleCode;
  readonly scope: RuleScope;
  readonly scopeId: string | null;
  readonly electricalProfileId: string;
  readonly parameters: Readonly<Record<string, number | boolean>>;
  readonly severity: AlarmSeverity;
  readonly debounceSamples: number;
  readonly recoverySamples: number;
}

const numericKeys: Readonly<Record<ManagedRuleCode, readonly string[]>> = {
  LOW_VOLTAGE: ['assertBelowV', 'clearAboveV'],
  HIGH_VOLTAGE: ['assertAboveV', 'clearBelowV'],
  VOLTAGE_LOSS: ['zeroToleranceV', 'clearAboveV'],
  LOW_CURRENT: ['assertBelowA', 'clearAboveA'],
  LOAD_LOSS: ['zeroToleranceA', 'referenceMinA'],
  SUDDEN_CURRENT_DROP: ['referenceCurrentA', 'dropPercent', 'clearDropPercent'],
  LOW_POWER: ['assertBelowW', 'clearAboveW'],
  HIGH_POWER: ['assertAboveW', 'clearBelowW'],
  NO_ENERGY_INCREMENT: ['maxDeltaKwh', 'windowMs'],
  ENERGY_COUNTER_RESET: ['minDecrementKwh'],
  ENERGY_CONSUMPTION_ANOMALY: ['minDeltaKwh', 'maxDeltaKwh', 'windowMs'],
};

export function ruleMetric(code: ManagedRuleCode): 'V' | 'A' | 'P' | 'E' {
  if (code.includes('VOLTAGE')) return 'V';
  if (code.includes('CURRENT') || code === 'LOAD_LOSS') return 'A';
  if (code.includes('POWER')) return 'P';
  return 'E';
}

/** Strict schema: refuse arbitrary Mongo-like objects, unknown fields and unsafe numeric settings. */
export function parseRuleDraft(value: unknown, requireCommissioned = false): RuleDraftInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_RULE_DRAFT');
  const row = value as Record<string, unknown>;
  const allowed = new Set([
    'id',
    'expectedRevision',
    'code',
    'scope',
    'scopeId',
    'electricalProfileId',
    'parameters',
    'severity',
    'debounceSamples',
    'recoverySamples',
  ]);
  if (Object.keys(row).some((key) => !allowed.has(key))) throw new Error('INVALID_RULE_FIELD');
  if (!MANAGED_RULE_CODES.includes(row.code as ManagedRuleCode))
    throw new Error('UNKNOWN_RULE_CODE');
  if (!['GLOBAL', 'QDF', 'PANEL', 'BREAKER'].includes(String(row.scope)))
    throw new Error('INVALID_RULE_SCOPE');
  if (!['INFO', 'WARNING', 'CRITICAL'].includes(String(row.severity)))
    throw new Error('INVALID_RULE_SEVERITY');
  if (row.electricalProfileId !== DEFAULT_DC_PROFILE.id)
    throw new Error('UNKNOWN_ELECTRICAL_PROFILE');
  const scope = row.scope as RuleScope;
  const scopeId = row.scopeId;
  if (
    (scope === 'GLOBAL' && scopeId !== null) ||
    (scope !== 'GLOBAL' &&
      (typeof scopeId !== 'string' || scopeId.length < 1 || scopeId.length > 128))
  )
    throw new Error('INVALID_RULE_SCOPE_ID');
  if (
    row.id !== undefined &&
    (typeof row.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(row.id))
  )
    throw new Error('INVALID_RULE_ID');
  if (
    row.expectedRevision !== undefined &&
    (!Number.isSafeInteger(row.expectedRevision) || Number(row.expectedRevision) < 1)
  )
    throw new Error('INVALID_RULE_REVISION');
  if (
    !Number.isInteger(row.debounceSamples) ||
    Number(row.debounceSamples) < 1 ||
    Number(row.debounceSamples) > 30 ||
    !Number.isInteger(row.recoverySamples) ||
    Number(row.recoverySamples) < 1 ||
    Number(row.recoverySamples) > 30
  )
    throw new Error('INVALID_RULE_SAMPLES');
  const parameters = row.parameters;
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
    throw new Error('INVALID_RULE_PARAMETERS');
  const p = parameters as Record<string, unknown>;
  const keys = numericKeys[row.code as ManagedRuleCode];
  const boolKeys =
    row.code === 'LOAD_LOSS'
      ? ['expectedLoad']
      : row.code === 'NO_ENERGY_INCREMENT'
        ? ['expectedLoad']
        : [];
  if (Object.keys(p).some((key) => !keys.includes(key) && !boolKeys.includes(key)))
    throw new Error('INVALID_RULE_PARAMETER_KEY');
  for (const key of keys) {
    if (
      typeof p[key] !== 'number' ||
      !Number.isFinite(p[key]) ||
      Number(p[key]) < 0 ||
      Number(p[key]) > 1_000_000_000
    )
      throw new Error('INVALID_RULE_PARAMETER_' + key);
  }
  for (const key of boolKeys) if (p[key] !== true) throw new Error('EXPECTED_LOAD_REQUIRED');
  const a = (key: string) => Number(p[key]);
  if (
    requireCommissioned &&
    ((row.code === 'LOW_VOLTAGE' && a('clearAboveV') <= a('assertBelowV')) ||
      (row.code === 'HIGH_VOLTAGE' && a('clearBelowV') >= a('assertAboveV')) ||
      (row.code === 'VOLTAGE_LOSS' && a('clearAboveV') <= a('zeroToleranceV')) ||
      (row.code === 'LOW_CURRENT' && a('clearAboveA') <= a('assertBelowA')) ||
      (row.code === 'LOW_POWER' && a('clearAboveW') <= a('assertBelowW')) ||
      (row.code === 'HIGH_POWER' && a('clearBelowW') >= a('assertAboveW')) ||
      (row.code === 'LOAD_LOSS' && a('referenceMinA') <= a('zeroToleranceA')) ||
      (row.code === 'SUDDEN_CURRENT_DROP' &&
        (a('referenceCurrentA') <= 0 ||
          a('dropPercent') > 100 ||
          a('clearDropPercent') >= a('dropPercent'))) ||
      (row.code === 'NO_ENERGY_INCREMENT' && a('windowMs') < 60_000) ||
      (row.code === 'ENERGY_CONSUMPTION_ANOMALY' &&
        (a('windowMs') < 60_000 || a('maxDeltaKwh') <= a('minDeltaKwh'))))
  )
    throw new Error('INVALID_RULE_HYSTERESIS');
  return {
    ...(row.id ? { id: row.id as string } : {}),
    ...(row.expectedRevision ? { expectedRevision: row.expectedRevision as number } : {}),
    code: row.code as ManagedRuleCode,
    scope,
    scopeId: scope === 'GLOBAL' ? null : (scopeId as string),
    electricalProfileId: DEFAULT_DC_PROFILE.id,
    parameters: p as Record<string, number | boolean>,
    severity: row.severity as AlarmSeverity,
    debounceSamples: row.debounceSamples as number,
    recoverySamples: row.recoverySamples as number,
  };
}

/** Narrower scope has priority; exact BREAKER overrides PANEL, QDF and GLOBAL. */
export function resolveRules(
  rules: readonly ManagedAlarmRule[],
  ancestorIds: Readonly<{
    qdfIds: readonly string[];
    panelIds: readonly string[];
    breakerId: string;
  }>,
): readonly ManagedAlarmRule[] {
  const rank: Record<RuleScope, number> = { GLOBAL: 0, QDF: 1, PANEL: 2, BREAKER: 3 };
  const matched = rules.filter(
    (r) =>
      r.status === 'PUBLISHED' &&
      (r.scope === 'GLOBAL' ||
        (r.scope === 'QDF' && ancestorIds.qdfIds.includes(r.scopeId ?? '')) ||
        (r.scope === 'PANEL' && ancestorIds.panelIds.includes(r.scopeId ?? '')) ||
        (r.scope === 'BREAKER' && r.scopeId === ancestorIds.breakerId)),
  );
  matched.sort(
    (a, b) =>
      rank[a.scope] - rank[b.scope] ||
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.id.localeCompare(b.id),
  );
  return [...new Map(matched.map((r) => [r.code, r])).values()];
}
