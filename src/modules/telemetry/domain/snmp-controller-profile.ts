/**
 * Read-only SNMP controller presentation contract, stored on the DEVICE.
 *
 * This is deliberately separate from commissioned ACCESS_PORT telemetry bindings:
 * displaying a controller observation must never certify a physical feed.
 */
export interface SnmpControllerSignal {
  readonly oid: string;
  readonly label: string;
  readonly displayMode: 'RAW' | 'ENUM';
}

export interface SnmpControllerProfile {
  readonly schemaVersion: 1;
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

/** Accept only explicitly declared source/OID presentation metadata; no engineering scaling. */
export function parseSnmpControllerProfile(value: unknown): SnmpControllerProfile | null {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['schemaVersion', 'title', 'sourceIdentity', 'signals']) ||
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
  for (const candidate of value.signals as unknown[]) {
    if (!isRecord(candidate) || !hasKeys(candidate, ['oid', 'label', 'displayMode'])) return null;
    const { oid, label, displayMode } = candidate;
    if (
      typeof oid !== 'string' ||
      oid.length > 256 ||
      !/^\d+(?:\.\d+){5,}$/.test(oid) ||
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 96 ||
      (displayMode !== 'RAW' && displayMode !== 'ENUM') ||
      seen.has(oid)
    ) {
      return null;
    }
    seen.add(oid);
    signals.push({ oid, label: label.trim(), displayMode });
  }

  return {
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
