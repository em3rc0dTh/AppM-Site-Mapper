import type { SnmpControllerProfile } from '../domain/snmp-controller-profile';
import { eltekDefinition } from '../domain/industrial/eltek';
import { decodeSnmpText } from '../domain/industrial/snmp-value';
import { projectControllerBalance } from './controller-balance';
import { controllerEvidenceExpiry, type ControllerEvidence } from './controller-evidence';
import { configuredControllerCapacity, controllerSummary } from './controller-summary';
import { presentControllerReading, type PresentedControllerReading } from './snmp-controller-presentation';
import type { SnmpBdfbLoadView } from './snmp-feed-service';
import type { ObservationStore } from '../infrastructure/industrial/store';

export async function listControllerEvidence(store: ObservationStore, source: string): Promise<ControllerEvidence[]> {
  const all: ControllerEvidence[] = [];
  const ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const rows = await store.list(source, 500, undefined, cursor);
    for (const row of rows) {
      if (row.sourceIdentity !== source || ids.has(row.id)) throw new Error('INVALID_CONTROLLER_CATALOG');
      ids.add(row.id);
      if (row.protocol === 'SNMP') all.push(row);
    }
    if (rows.length < 500) return all;
    const next = rows.at(-1)?.id;
    if (!next || (cursor && next <= cursor)) throw new Error('INVALID_CONTROLLER_CURSOR');
    cursor = next;
  }
  throw new Error('CONTROLLER_CATALOG_LIMIT');
}

function headroom(rated: number | null, current: number | null) {
  const valid = rated !== null && Number.isFinite(rated) && rated > 0 &&
    current !== null && Number.isFinite(current) && current >= 0;
  const usage = valid ? current! / rated! * 100 : null;
  return {
    availableA: valid ? Math.max(0, rated! - current!) : null,
    utilizationPct: usage !== null && Number.isFinite(usage) ? usage : null,
  };
}

export interface SnmpDigitalInput {
  readonly key: string;
  readonly label: string | null;
  readonly status: string | null;
  readonly enabled: boolean | null;
  readonly configuration: string | null;
  readonly value: number | null;
  readonly observedAt: string | null;
  readonly expiresAt: number | null;
}

type InputField = 'status' | 'label' | 'enabled' | 'configuration' | 'value';
const inputFields: Readonly<Record<string, InputField>> = {
  inputIoUnitProgInputStatus: 'status',
  inputIoUnitProgInputDescription: 'label',
  inputIoUnitProgInputAlarmEnable: 'enabled',
  inputIoUnitProgInputConfiguration: 'configuration',
  inputIoUnitProgInputValue: 'value',
};

/** Vendor MIB table adapter. Rows are joined by the complete instance suffix, never panel names. */
export function projectSnmpDigitalInputs(
  signals: readonly ControllerEvidence[],
  now: number,
): SnmpDigitalInput[] {
  const groups = new Map<string, Partial<Record<InputField, ControllerEvidence[]>>>();
  for (const signal of signals) {
    if (signal.protocol !== 'SNMP') continue;
    const definition = eltekDefinition(signal.key);
    if (!definition || definition.name !== signal.mibName) continue;
    const field = inputFields[definition.name];
    if (!field || !signal.key.startsWith(definition.oid + '.')) continue;
    const suffix = signal.key.slice(definition.oid.length + 1);
    if (!/^\d+(?:\.\d+)*$/.test(suffix)) continue;
    const key = signal.sourceIdentity + ':' + suffix;
    const group = groups.get(key) ?? {};
    (group[field] ??= []).push(signal);
    groups.set(key, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .flatMap(([key, fields]) => {
      const status = fields.status?.length === 1 ? fields.status[0]! : null;
      if (!status) return [];
      const expiresAt = controllerEvidenceExpiry(status, now);
      const fresh = expiresAt !== null;
      const get = (field: InputField) => {
        const candidates = fields[field];
        const item = candidates?.length === 1 ? candidates[0]! : null;
        return item && fresh && item.eventId === status.eventId &&
          controllerEvidenceExpiry(item, now) !== null ? item : null;
      };
      const label = get('label');
      const enabled = get('enabled');
      const value = get('value')?.rawValue;
      return [{
        key,
        label: label ? decodeSnmpText(label.rawValue) : null,
        status: fresh && status.quality === 'VALID' ? status.enumLabel ?? null : null,
        enabled: enabled?.quality === 'VALID' && enabled.enumLabel === 'enabled' ? true :
          enabled?.quality === 'VALID' && enabled.enumLabel === 'disabled' ? false : null,
        configuration: get('configuration')?.enumLabel ?? null,
        value: typeof value === 'number' && Number.isFinite(value) ? value : null,
        observedAt: status.observedAt,
        expiresAt,
      }];
    });
}

export interface ControllerProjectedReading {
  readonly oid: string;
  readonly role: 'BRANCH_CURRENT' | 'OTHER';
  readonly reading: PresentedControllerReading;
  readonly eventId: string | null;
  readonly expiresAt: number | null;
}

/** One display-only read model; never creates or changes ACCESS_PORT samples or certification. */
export function projectSnmpController(
  profile: SnmpControllerProfile,
  observations: readonly ControllerEvidence[],
  load: SnmpBdfbLoadView,
  now = Date.now(),
) {
  const signals = observations.filter((s) => s.protocol === 'SNMP' && s.sourceIdentity === profile.sourceIdentity);
  const find = (oid: string) => {
    const matches = signals.filter((s) => s.key === oid);
    return matches.length === 1 ? matches[0]! : undefined;
  };
  const balance = projectControllerBalance(profile, signals, now);
  const config = profile.balance;
  const normalized = balance?.normalized;
  const ratings = configuredControllerCapacity(load);
  const summary = config?.normalization ? {
    currentA: normalized?.totalA ?? null,
    voltageV: normalized?.voltageV ?? null,
    estimatedPowerKw: normalized?.estimatedPowerKw ?? null,
  } : controllerSummary(profile, signals, now);
  const readings: ControllerProjectedReading[] = profile.signals.map((spec) => {
    const signal = find(spec.oid);
    const expiresAt = signal ? controllerEvidenceExpiry(signal, now) : null;
    const original = presentControllerReading(signal, spec, now);
    const value = spec.oid === config?.totalOid ? normalized?.totalA :
      spec.oid === config?.voltageOid ? normalized?.voltageV :
      spec.oid === config?.branchOid ? normalized?.branchA : null;
    const unit = spec.oid === config?.voltageOid ? 'V' : 'A';
    const reading: PresentedControllerReading =
      expiresAt !== null && value !== null && value !== undefined && Number.isFinite(value)
      ? {
          ...original, state: 'RECENT', quality: 'DIAGNOSTIC',
          text: String(value) + ' ' + unit, numericValue: value,
          receivedAt: signal!.observedAt,
        }
      : original.state === 'RECENT' && expiresAt === null
        ? { ...original, state: 'STALE', text: '—', numericValue: null }
        : original;
    return {
      oid: spec.oid,
      role: spec.oid === config?.branchOid ? 'BRANCH_CURRENT' : 'OTHER',
      reading,
      eventId: signal?.eventId ?? null,
      expiresAt,
    };
  });
  const expirations = readings.flatMap((item) =>
    item.reading.state === 'RECENT' && item.expiresAt !== null ? [item.expiresAt] : []);
  const expiresAt = expirations.length ? Math.min(...expirations) : null;
  const validPair = load.expectedFeedCount === 2 && load.feedCount === 2 &&
    load.missingFeedPositions.length === 0 &&
    load.configurationIssues.every((issue) => /^SHUNT_NOT_VERIFIED_/.test(issue)) &&
    load.feeds.length === 2 && new Set(load.feeds.map((feed) => feed.accessPortId)).size === 2 &&
    load.feeds.filter((feed) => feed.side === 'A').length === 1 &&
    load.feeds.filter((feed) => feed.side === 'B').length === 1;
  const inputs = config && validPair ? load.feeds.map((feed) => {
    const currentA = balance?.coherent
      ? (feed.side === 'A' ? normalized?.remainderA : normalized?.branchA) ?? null : null;
    const raw = balance?.coherent
      ? (feed.side === 'A' ? balance.remainderRaw : balance.branchRaw) : null;
    return {
      accessPortId: feed.accessPortId,
      currentA,
      raw,
      ratedA: feed.ratedCurrentA,
      observedAt: currentA !== null ? balance?.observedAt ?? null : null,
      monitorStatus: feed.side === 'B' ? balance?.branchStatus ?? null : null,
      ...headroom(feed.ratedCurrentA, currentA),
    };
  }) : [];
  return {
    sourceIdentity: profile.sourceIdentity,
    authority: 'DIAGNOSTIC_ONLY' as const,
    observedAt: balance?.observedAt ?? null,
    expiresAt,
    balance,
    electrical: {
      ...summary,
      ratedA: ratings,
      ...headroom(ratings, summary.currentA),
    },
    inputs,
    readings,
    digitalInputs: projectSnmpDigitalInputs(signals, now),
    diagnosticInputCount: inputs.filter((input) => input.currentA !== null).length,
    certifiedInputCount: load.freshFeedCount,
    expectedInputCount: load.expectedFeedCount,
  };
}
export type SnmpControllerProjection = ReturnType<typeof projectSnmpController>;
