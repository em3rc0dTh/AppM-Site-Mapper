/**
 * Read-only SNMP controller presentation contract, stored on the DEVICE.
 *
 * This is deliberately separate from commissioned ACCESS_PORT telemetry bindings:
 * displaying a controller observation must never certify a physical feed.
 */
export interface SnmpControllerSignal {
  readonly oid: string;
  readonly label: string;
  readonly displayMode: 'RAW' | 'ENUM' | 'NORMALIZED';
  /** General controller magnitudes only; never physical feed identity. */
  readonly metric?: 'CURRENT' | 'VOLTAGE' | undefined;
}

export interface ControllerBalanceConfig {
  readonly method: 'TOTAL_MINUS_BRANCH';
  readonly totalOid: string;
  readonly branchOid: string;
  readonly voltageOid: string;
  readonly branchStatusOid: string;
  readonly normalization?: {
    readonly totalCurrentScale: number;
    readonly branchCurrentScale: number;
    readonly voltageScale: number;
  };
}

export interface SnmpControllerProfile {
  readonly schemaVersion: 1;
  readonly balance?: ControllerBalanceConfig;
  readonly title: string;
  readonly sourceIdentity: string;
  readonly signals: readonly SnmpControllerSignal[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** Accept only explicitly declared source/OID presentation metadata; no client-side engineering scaling. */
export function parseSnmpControllerProfile(value: unknown): SnmpControllerProfile | null {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['schemaVersion', 'title', 'sourceIdentity', 'signals', 'balance']) ||
    value.schemaVersion !== 1 ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 96 ||
    typeof value.sourceIdentity !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value.sourceIdentity) ||
    !Array.isArray(value.signals) ||
    value.signals.length < 1 ||
    value.signals.length > 16
  ) {
    return null;
  }

  const seen = new Set<string>();
  const signals: SnmpControllerSignal[] = [];
  const metrics = new Set<string>();
  for (const candidate of value.signals as unknown[]) {
    if (!isRecord(candidate) || !hasKeys(candidate, ['oid', 'label', 'displayMode', 'metric']))
      return null;
    const { oid, label, displayMode, metric } = candidate;
    if (
      typeof oid !== 'string' ||
      oid.length > 256 ||
      !/^\d+(?:\.\d+){5,}$/.test(oid) ||
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 96 ||
      (displayMode !== 'RAW' && displayMode !== 'ENUM' && displayMode !== 'NORMALIZED') ||
      (displayMode === 'NORMALIZED'
        ? (metric !== 'CURRENT' && metric !== 'VOLTAGE') || metrics.has(metric)
        : metric !== undefined) ||
      seen.has(oid)
    ) {
      return null;
    }
    seen.add(oid);
    if (metric === 'CURRENT' || metric === 'VOLTAGE') {
      metrics.add(metric);
      signals.push({ oid, label: label.trim(), displayMode, metric });
    } else {
      signals.push({ oid, label: label.trim(), displayMode });
    }
  }

  let balance: ControllerBalanceConfig | undefined;

  if (value.balance !== undefined) {
    const b = value.balance;
    if (
      !isRecord(b) ||
      !hasKeys(b, [
        'method',
        'totalOid',
        'branchOid',
        'voltageOid',
        'branchStatusOid',
        'normalization',
      ]) ||
      b.method !== 'TOTAL_MINUS_BRANCH'
    )
      return null;

    const oids = [b.totalOid, b.branchOid, b.voltageOid, b.branchStatusOid];

    if (
      oids.some((oid) => typeof oid !== 'string' || !signals.some((spec) => spec.oid === oid)) ||
      new Set(oids).size !== oids.length
    )
      return null;

    let normalization: ControllerBalanceConfig['normalization'];

    if (b.normalization !== undefined) {
      const n = b.normalization;
      if (
        !isRecord(n) ||
        !hasKeys(n, ['totalCurrentScale', 'branchCurrentScale', 'voltageScale']) ||
        typeof n.totalCurrentScale !== 'number' ||
        typeof n.branchCurrentScale !== 'number' ||
        typeof n.voltageScale !== 'number' ||
        !Number.isFinite(n.totalCurrentScale) ||
        !Number.isFinite(n.branchCurrentScale) ||
        !Number.isFinite(n.voltageScale) ||
        n.totalCurrentScale <= 0 ||
        n.branchCurrentScale <= 0 ||
        n.voltageScale === 0
      )
        return null;

      normalization = {
        totalCurrentScale: n.totalCurrentScale,
        branchCurrentScale: n.branchCurrentScale,
        voltageScale: n.voltageScale,
      };
    }

    balance = {
      ...(normalization ? { normalization } : {}),
      method: 'TOTAL_MINUS_BRANCH',
      totalOid: b.totalOid as string,
      branchOid: b.branchOid as string,
      voltageOid: b.voltageOid as string,
      branchStatusOid: b.branchStatusOid as string,
    };
  }

  return {
    ...(balance ? { balance } : {}),
    schemaVersion: 1,
    title: value.title.trim(),
    sourceIdentity: value.sourceIdentity,
    signals,
  };
}

export function controllerProfileFromAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined,
): SnmpControllerProfile | null {
  return parseSnmpControllerProfile(attributes?.snmpControllerProfile);
}

[executed on device: TFARM04 (41aaa2a2-45b1-4e70-8348-0c4d0abdd30e)]