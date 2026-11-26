import type { Envelope, Signal } from './observations';
import { eltekDefinition, eltekMibMetadata } from './eltek';

export interface TrapView {
  readonly id: string;
  readonly sourceIdentity: string;
  readonly origin: string | null;
  readonly receivedAt: string;
  readonly transport: 'trap' | 'inform';
  readonly notificationOid: string | null;
  readonly notificationName: string | null;
  readonly severity: string | null;
  readonly alarmState: 'ACTIVE' | 'RESOLVED' | null;
  readonly alarmCode: string | null;
  readonly notificationMibFile: string | null;
  readonly notificationMibKind: string | null;
  readonly notificationMibObjects: readonly string[];
  readonly varbinds: readonly {
    oid: string;
    name: string | null;
    type: string;
    value: string;
    mibFile: string | null;
    mibKind: string | null;
    mibSyntax: string | null;
    enumLabel: string | null;
    referencedName: string | null;
    referencedMibFile: string | null;
  }[];
  readonly varbindCount: number;
}

export interface TrapPage {
  readonly events: readonly TrapView[];
  readonly nextCursor: string | null;
}

export function trapCursor(receivedAt: string, id: string): string {
  return Buffer.from(JSON.stringify([receivedAt, id])).toString('base64url');
}

export function parseTrapCursor(value: string | null): { receivedAt: string; id: string } | null {
  if (value === null) return null;
  if (value.length < 20 || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed[0]) ||
      !Number.isFinite(Date.parse(parsed[0])) ||
      typeof parsed[1] !== 'string' ||
      !/^[a-f0-9-]{36,64}$/.test(parsed[1])
    )
      return null;
    return { receivedAt: parsed[0], id: parsed[1] };
  } catch {
    return null;
  }
}

/** Preserve evidence exactly; never invent a severity, an alarm, or a feed association. */
function standardSnmpDefinition(oid: string) {
  if (oid === '1.3.6.1.2.1.1.3.0')
    return {
      name: 'sysUpTime',
      file: 'SNMPv2-MIB',
      kind: 'OBJECT-TYPE',
      syntax: 'TimeTicks',
    };
  if (oid === '1.3.6.1.6.3.1.1.4.1.0')
    return {
      name: 'snmpTrapOID',
      file: 'SNMPv2-MIB',
      kind: 'OBJECT-TYPE',
      syntax: 'OBJECT IDENTIFIER',
    };
  return null;
}

export function presentTrap(
  id: string,
  envelope: Envelope,
  signals: readonly Signal[] = [],
): TrapView | null {
  if (
    envelope.protocol !== 'SNMP' ||
    (envelope.transport !== 'trap' && envelope.transport !== 'inform')
  )
    return null;
  const alarmCandidates = signals.filter(
    (signal) =>
      signal.kind === 'alarm' &&
      signal.quality === 'VALID' &&
      (signal.alarmState === 'ACTIVE' || signal.alarmState === 'RESOLVED'),
  );
  const alarm = alarmCandidates.length === 1 ? alarmCandidates[0]! : null;
  const raw = envelope.raw;
  const varbinds =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'varbinds' in raw &&
    Array.isArray(raw.varbinds)
      ? (raw.varbinds as unknown[])
      : [];
  const points = varbinds.slice(0, 32).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.oid !== 'string') return [];
    const value = record.value;
    let printable: string;
    if (typeof value === 'string') printable = value;
    else if (typeof value === 'number' || typeof value === 'boolean') printable = String(value);
    else {
      try {
        printable = JSON.stringify(value) ?? 'null';
      } catch {
        printable = '—';
      }
    }
    const mib = eltekMibMetadata(record.oid);
    const standard = standardSnmpDefinition(record.oid);
    const referenced =
      typeof value === 'string' && /^\d+(?:\.\d+){5,}$/.test(value)
        ? eltekMibMetadata(value)
        : undefined;
    const numeric = typeof value === 'number' ? value : null;
    const enumLabel =
      numeric === null
        ? null
        : (Object.entries(mib?.enums ?? {}).find(([, enumValue]) => enumValue === numeric)?.[0] ??
          null);
    return [
      {
        oid: record.oid,
        name: mib?.name ?? standard?.name ?? null,
        type: String(record.type ?? ''),
        value: printable.slice(0, 512),
        mibFile: mib?.file ?? standard?.file ?? null,
        mibKind: mib?.kind ?? standard?.kind ?? null,
        mibSyntax: mib?.syntax ?? standard?.syntax ?? null,
        enumLabel,
        referencedName: referenced?.name ?? null,
        referencedMibFile: referenced?.file ?? null,
      },
    ];
  });
  const oid = typeof envelope.notificationOid === 'string' ? envelope.notificationOid : null;
  const notificationMib = oid ? eltekMibMetadata(oid) : undefined;
  return {
    id,
    sourceIdentity: envelope.sourceIdentity,
    origin: envelope.origin ?? null,
    receivedAt: envelope.receivedAt,
    transport: envelope.transport,
    notificationOid: oid,
    notificationName: oid ? (eltekDefinition(oid)?.name ?? null) : null,
    severity: alarm?.severity ?? null,
    alarmState:
      alarm?.alarmState === 'ACTIVE' || alarm?.alarmState === 'RESOLVED' ? alarm.alarmState : null,
    alarmCode: alarm?.alarmCode ?? null,
    notificationMibFile: notificationMib?.file ?? null,
    notificationMibKind: notificationMib?.kind ?? null,
    notificationMibObjects: notificationMib?.objects ?? [],
    varbinds: points,
    varbindCount: varbinds.length,
  };
}

export function configuredTrapSources(
  attributes: Readonly<Record<string, unknown>> | undefined,
): string[] {
  const value = attributes?.snmpTrapSourceIdentities;
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is string =>
        typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(item),
    )
    .slice(0, 8);
}

export function parseTrapSources(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 8 ||
    value.some(
      (item) => typeof item !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(item),
    )
  )
    return null;
  const sources = value as string[];
  return new Set(sources).size === sources.length ? sources : null;
}