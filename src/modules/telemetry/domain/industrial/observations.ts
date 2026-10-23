import { eltekAlarm, eltekDefinition, eltekNotifications, eltekMeasuredValue } from './eltek';
import { createHash, randomUUID } from 'node:crypto';

export class IndustrialInputError extends Error {}

export type Quality = 'UNOBSERVED' | 'VALID' | 'STALE' | 'INVALID' | 'UNKNOWN' | 'OFFLINE';
export type SignalKind = 'measurement' | 'state' | 'event' | 'alarm' | 'unknown';
export interface SignalRule {
  key: string;
  kind: SignalKind;
  unit?: string;
  scale?: number;
  offset?: number;
  targetId?: string;
  activeValues?: readonly (number | string | boolean)[];
  clearValues?: readonly (number | string | boolean)[];
  severity?: string;
  evidence?: string;
  match?: 'oid-instance';
  valueMap?: readonly { raw: string | number | boolean; code: number; label?: string }[];
}
export interface SourceProfile {
  sourceIdentity: string;
  protocol: 'MQTT' | 'SNMP';
  version: string;
  targetId?: string;
  staleMs: number;
  rules: readonly SignalRule[];
  mib?: 'eltek-rev54';
  maxSignals?: number;
}
export interface Envelope {
  protocol: 'MQTT' | 'SNMP';
  sourceIdentity: string;
  transport: string;
  receivedAt: string;
  observedAt?: string;
  messageId?: string;
  captureId?: string;
  topic?: string;
  origin?: string;
  notificationOid?: string;
  raw: unknown;
}
export interface Signal {
  id: string;
  key: string;
  sourceIdentity: string;
  protocol: Envelope['protocol'];
  targetId: string | null;
  kind: SignalKind;
  mibName: string | null;
  enumLabel?: string | null;
  interpretation?: 'PROFILE' | 'MIB_ENUM' | 'UNINTERPRETED';
  derivedFrom?: readonly string[];
  rawType: string;
  rawValue: unknown;
  value: number | string | boolean | null;
  unit: string | null;
  scale: number | null;
  quality: Quality;
  alarmState: 'ACTIVE' | 'RESOLVED' | 'UNKNOWN' | null;
  severity: string | null;
  profileVersion: string;
  receivedAt: string;
  observedAt: string;
  staleMs: number;
  eventId: string;
}
export interface ObservationBatch {
  id: string;
  envelope: Envelope;
  signals: Signal[];
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const oid = /^(?:[0-2])(?:\.[0-9]+){2,127}$/;
const identity = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/;
const kinds: SignalKind[] = ['measurement', 'state', 'event', 'alarm', 'unknown'];

export function parseProfiles(raw: string | undefined): SourceProfile[] {
  if (!raw?.trim()) return [];
  const list: unknown = JSON.parse(raw);
  if (!Array.isArray(list) || list.length > 1000) throw new Error('Invalid industrial profiles');
  const seen = new Set<string>();
  for (const p of list) {
    if (
      !record(p) ||
      typeof p.sourceIdentity !== 'string' ||
      !identity.test(p.sourceIdentity) ||
      !['MQTT', 'SNMP'].includes(String(p.protocol)) ||
      typeof p.version !== 'string' ||
      !p.version ||
      (p.mib !== undefined && p.mib !== 'eltek-rev54') ||
      p.version.length > 120 ||
      !Number.isInteger(p.staleMs) ||
      Number(p.staleMs) < 1000 ||
      !Array.isArray(p.rules) ||
      p.rules.length > 4096 ||
      (p.targetId !== undefined && (typeof p.targetId !== 'string' || !p.targetId)) ||
      (p.maxSignals !== undefined &&
        (!Number.isInteger(p.maxSignals) ||
          Number(p.maxSignals) < 1 ||
          Number(p.maxSignals) > 10000))
    )
      throw new Error('Invalid industrial source profile');
    const source = `${p.protocol}:${p.sourceIdentity}`;
    if (seen.has(source)) throw new Error('Duplicate industrial source profile');
    seen.add(source);
    const keys = new Set();
    for (const r of p.rules) {
      if (
        !record(r) ||
        typeof r.key !== 'string' ||
        !r.key ||
        r.key.length > 1024 ||
        !kinds.includes(r.kind as SignalKind) ||
        keys.has(r.key) ||
        (r.unit !== undefined && (typeof r.unit !== 'string' || r.unit.length > 64)) ||
        (r.targetId !== undefined && (typeof r.targetId !== 'string' || !r.targetId)) ||
        (r.severity !== undefined && typeof r.severity !== 'string') ||
        (r.scale !== undefined &&
          (typeof r.scale !== 'number' || !Number.isFinite(r.scale) || r.scale === 0)) ||
        (r.offset !== undefined && (typeof r.offset !== 'number' || !Number.isFinite(r.offset)))
      )
        throw new Error('Invalid industrial signal rule');
      if (
        r.evidence !== undefined &&
        (typeof r.evidence !== 'string' || !r.evidence || r.evidence.length > 1024)
      )
        throw new Error('Invalid interpretation evidence');
      if (
        r.match !== undefined &&
        (r.match !== 'oid-instance' || p.protocol !== 'SNMP' || !oid.test(r.key))
      )
        throw new Error('Invalid OID instance rule');
      if (r.valueMap !== undefined) {
        if (
          !['state', 'event'].includes(String(r.kind)) ||
          !Array.isArray(r.valueMap) ||
          !r.valueMap.length ||
          r.valueMap.length > 128
        )
          throw new Error('Invalid state value map');
        const mapped = new Set<string>();
        for (const item of r.valueMap) {
          if (
            !record(item) ||
            !['string', 'number', 'boolean'].includes(typeof item.raw) ||
            typeof item.code !== 'number' ||
            !Number.isFinite(item.code) ||
            (item.label !== undefined && typeof item.label !== 'string') ||
            mapped.has(JSON.stringify(item.raw))
          )
            throw new Error('Invalid state code');
          mapped.add(JSON.stringify(item.raw));
        }
      }
      keys.add(r.key);
      for (const values of [r.activeValues, r.clearValues]) {
        if (
          values !== undefined &&
          (!Array.isArray(values) ||
            values.length > 128 ||
            values.some((v) => !['string', 'number', 'boolean'].includes(typeof v)))
        )
          throw new Error('Invalid alarm values');
      }
      if (
        r.kind === 'alarm' &&
        (!Array.isArray(r.activeValues) ||
          !Array.isArray(r.clearValues) ||
          r.activeValues.some((v) => (r.clearValues as unknown[]).includes(v)))
      )
        throw new Error('Alarm requires explicit disjoint active/clear values');
    }
  }
  return list as SourceProfile[];
}

export function normalizeObservations(
  envelope: Envelope,
  profile: SourceProfile,
): ObservationBatch {
  if (envelope.sourceIdentity !== profile.sourceIdentity || envelope.protocol !== profile.protocol)
    throw new IndustrialInputError('Industrial source mismatch');
  const received = Date.parse(envelope.receivedAt);
  const observed = envelope.observedAt === undefined ? received : Date.parse(envelope.observedAt);
  if (!Number.isFinite(received) || !Number.isFinite(observed) || observed > received + 60000)
    throw new IndustrialInputError('Invalid industrial timestamp');
  if (envelope.captureId !== undefined && !/^[a-f0-9-]{36}$/.test(envelope.captureId))
    throw new IndustrialInputError('Invalid capture ID');
  // Structural bounds apply equally to MQTT and the authenticated HTTP receiver.
  const rawJson = JSON.stringify(envelope.raw);
  if (!rawJson || Buffer.byteLength(rawJson) > 262144)
    throw new IndustrialInputError('Industrial payload too large');
  const nodes: Array<{
    key: string;
    value: unknown;
    type: string;
    derivedFrom?: readonly string[];
  }> = [];
  const add = (key: string, value: unknown, type: string) => {
    if (nodes.length >= (profile.maxSignals ?? 4096) || key.length > 1024)
      throw new IndustrialInputError('Industrial signal limit exceeded');
    nodes.push({ key, value, type });
  };
  if (envelope.protocol === 'MQTT') {
    if (!envelope.topic || !record(envelope.raw))
      throw new IndustrialInputError('Invalid industrial MQTT envelope');
    let count = 0;
    const walk = (value: unknown, path: string, depth: number) => {
      if (++count > 12000 || depth > 16)
        throw new IndustrialInputError('Industrial payload too complex');
      if (record(value) || Array.isArray(value)) {
        const entries = Object.entries(value);
        if (!entries.length) add(path, value, Array.isArray(value) ? 'array' : 'object');
        for (const [key, child] of entries) {
          if (['__proto__', 'prototype', 'constructor'].includes(key))
            throw new IndustrialInputError('Unsafe MQTT key');
          walk(child, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, depth + 1);
        }
      } else add(path, value, value === null ? 'null' : typeof value);
    };
    walk(envelope.raw, '', 0);
  } else {
    if (
      !record(envelope.raw) ||
      !Array.isArray(envelope.raw.varbinds) ||
      envelope.raw.varbinds.length > 4096 ||
      (envelope.notificationOid !== undefined && !oid.test(envelope.notificationOid))
    )
      throw new IndustrialInputError('Invalid SNMP capture');
    for (const vb of envelope.raw.varbinds) {
      if (
        !record(vb) ||
        typeof vb.oid !== 'string' ||
        !oid.test(vb.oid) ||
        !['number', 'string'].includes(typeof vb.type) ||
        !Object.hasOwn(vb, 'value')
      )
        throw new IndustrialInputError('Invalid SNMP varbind');
      add(vb.oid, vb.value, String(vb.type));
    }
  }
  const extraRules: SignalRule[] = [];
  if (envelope.protocol === 'SNMP' && envelope.notificationOid) {
    const notification =
      profile.mib === 'eltek-rev54'
        ? eltekNotifications.find(
            (d) =>
              d.oid === envelope.notificationOid ||
              d.oid === envelope.notificationOid?.replace(/\.0\.(\d+)$/, '.$1'),
          )
        : undefined;
    const key = `notification:${envelope.notificationOid}`;
    add(key, notification?.name ?? envelope.notificationOid, 'notification');
    if (notification) extraRules.push({ key, kind: 'event' });
  }
  if (profile.mib === 'eltek-rev54' && envelope.protocol === 'SNMP') {
    const measured = eltekMeasuredValue(
      nodes.map((n) => ({ oid: n.key, value: n.value })),
      envelope.notificationOid,
    );
    if (measured && !nodes.some((n) => n.key === measured.oid)) {
      add(measured.oid, measured.value, 'derived-eltek-measurement');
      nodes[nodes.length - 1]!.derivedFrom = measured.derivedFrom;
    }
    const alarm = eltekAlarm(
      nodes.map((n) => ({ oid: n.key, value: n.value })),
      envelope.notificationOid,
    );
    if (alarm) {
      add(alarm.key, alarm.value, 'derived-eltek-onOff');
      extraRules.push({
        key: alarm.key,
        kind: 'alarm',
        activeValues: [1],
        clearValues: [0],
        severity: alarm.severity,
      });
    }
  }
  const unique = new Set(nodes.map((n) => n.key));
  if (unique.size !== nodes.length)
    throw new IndustrialInputError('Duplicate industrial signal key');
  const id = envelope.messageId
    ? digest([envelope.protocol, envelope.sourceIdentity, envelope.transport, envelope.messageId])
    : (envelope.captureId ?? randomUUID());
  const rules = new Map([...extraRules, ...profile.rules].map((rule) => [rule.key, rule]));
  return {
    id,
    envelope,
    signals: nodes.map((n) => {
      const rule =
        rules.get(n.key) ??
        profile.rules
          .filter((r) => r.match === 'oid-instance' && n.key.startsWith(r.key + '.'))
          .sort((a, b) => b.key.length - a.key.length)[0];
      const definition =
        profile.mib === 'eltek-rev54' && envelope.protocol === 'SNMP'
          ? eltekDefinition(n.key)
          : undefined;
      let enumLabel =
        typeof n.value === 'number'
          ? (Object.entries(definition?.enums ?? {}).find(([, v]) => v === n.value)?.[0] ?? null)
          : null;
      const kind = rule?.kind ?? (definition?.enums ? 'state' : 'unknown');
      let quality: Quality =
        (rule && rule.kind !== 'unknown') || (!rule && enumLabel) ? 'VALID' : 'UNKNOWN';
      let value: Signal['value'] = null;
      let alarmState: Signal['alarmState'] = null;
      if (rule?.kind === 'measurement') {
        // No guessed units, string coercion or scale from object names.
        if (
          typeof n.value !== 'number' ||
          !Number.isFinite(n.value) ||
          !rule.unit ||
          rule.scale === undefined
        )
          quality = !rule.unit || rule.scale === undefined ? 'UNKNOWN' : 'INVALID';
        else {
          value = n.value * rule.scale + (rule.offset ?? 0);
          if (!Number.isFinite(value)) {
            value = null;
            quality = 'INVALID';
          }
        }
      } else if (!rule && enumLabel && typeof n.value === 'number') {
        value = n.value;
      } else if (rule && ['string', 'number', 'boolean'].includes(typeof n.value)) {
        value = n.value as number | string | boolean;
        if (rule.kind === 'alarm') {
          alarmState = rule.activeValues?.includes(value)
            ? 'ACTIVE'
            : rule.clearValues?.includes(value)
              ? 'RESOLVED'
              : 'UNKNOWN';
          if (alarmState === 'UNKNOWN') quality = 'UNKNOWN';
        }
        if (rule.valueMap) {
          const mapped = rule.valueMap.find((item) => item.raw === n.value);
          value = mapped?.code ?? null;
          enumLabel = mapped?.label ?? null;
          if (!mapped) quality = 'UNKNOWN';
        }
      } else if (rule && rule.kind !== 'unknown') quality = 'INVALID';
      return {
        id: digest([envelope.protocol, envelope.sourceIdentity, envelope.topic ?? '', n.key]),
        key: n.key,
        sourceIdentity: envelope.sourceIdentity,
        protocol: envelope.protocol,
        targetId: rule?.targetId ?? profile.targetId ?? null,
        kind,
        enumLabel,
        interpretation: rule
          ? rule.kind === 'unknown' ||
            (rule.kind === 'measurement' && (!rule.unit || rule.scale === undefined))
            ? 'UNINTERPRETED'
            : 'PROFILE'
          : definition?.enums
            ? 'MIB_ENUM'
            : 'UNINTERPRETED',
        ...(n.derivedFrom ? { derivedFrom: n.derivedFrom } : {}),
        mibName:
          profile.mib === 'eltek-rev54' && envelope.protocol === 'SNMP'
            ? (eltekDefinition(n.key)?.name ?? null)
            : null,
        rawType: n.type,
        rawValue: n.value,
        value,
        unit: rule?.unit ?? null,
        scale: rule?.scale ?? null,
        quality,
        alarmState,
        severity: rule?.severity ?? null,
        profileVersion: profile.version,
        receivedAt: new Date(received).toISOString(),
        observedAt: new Date(observed).toISOString(),
        staleMs: profile.staleMs,
        eventId: id,
      };
    }),
  };
}

export function signalQuality(signal: Signal, now = Date.now()): Quality {
  if (
    signal.quality === 'VALID' &&
    now - Math.min(Date.parse(signal.receivedAt), Date.parse(signal.observedAt)) > signal.staleMs
  )
    return 'STALE';
  return signal.quality;
}

/** Freshness is independent of interpretation validity and of a latched alarm state.
 * STALE refers to the last relevant observation, never proof of electrical power loss.
 */
export function communicationQuality(signal: Signal, now = Date.now()): Quality {
  if (signal.quality === 'OFFLINE' || signal.quality === 'UNOBSERVED') return signal.quality;
  return now - Math.min(Date.parse(signal.receivedAt), Date.parse(signal.observedAt)) >
    signal.staleMs
    ? 'STALE'
    : 'VALID';
}
