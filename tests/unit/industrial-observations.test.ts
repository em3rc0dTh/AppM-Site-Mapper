import { describe, expect, it } from 'vitest';
import {
  normalizeObservations,
  parseProfiles,
  signalQuality,
  type Envelope,
  type SourceProfile,
} from '@/modules/telemetry/domain/industrial/observations';
import { MemoryObservationStore } from '@/modules/telemetry/infrastructure/industrial/store';
import { eltekDefinition, eltekNotifications } from '@/modules/telemetry/domain/industrial/eltek';
const time = '2026-10-23T17:00:00.000Z';
const profile: SourceProfile = {
  sourceIdentity: 'EMU-1',
  protocol: 'MQTT',
  version: 'lab-1',
  staleMs: 1000,
  rules: [
    { key: '/reported/point/U1', kind: 'measurement', unit: 'V', scale: 1 },
    { key: '/alarm', kind: 'alarm', activeValues: [true], clearValues: [false] },
  ],
};
const mqtt = (raw: unknown, overrides: Partial<Envelope> = {}): Envelope => ({
  protocol: 'MQTT',
  sourceIdentity: 'EMU-1',
  transport: 'publish',
  topic: 'data/dev/EMU-1',
  receivedAt: time,
  raw,
  ...overrides,
});
describe('industrial observations', () => {
  it('preserves unknown fields, original types and legitimate zero without inferred semantics', () => {
    const envelope = mqtt({
      reported: { point: { U1: 0, future: { sample: '13' } } },
      extra: [true, null],
    });
    const b = normalizeObservations(envelope, profile);
    expect(b.envelope.raw).toEqual(envelope.raw);
    expect(b.signals.find((s) => s.key.endsWith('/U1'))).toMatchObject({
      value: 0,
      quality: 'VALID',
      unit: 'V',
    });
    expect(b.signals.find((s) => s.key.endsWith('/sample'))).toMatchObject({
      rawValue: '13',
      value: null,
      quality: 'UNKNOWN',
      unit: null,
    });
    expect(signalQuality(b.signals[0]!, Date.parse(time) + 1001)).toBe('STALE');
  });
  it('does not coerce strings, guess scales or overwrite absent fields', async () => {
    const store = new MemoryObservationStore();
    await store.commit(normalizeObservations(mqtt({ reported: { point: { U1: 10 } } }), profile));
    await store.commit(normalizeObservations(mqtt({ another: 1 }), profile));
    expect((await store.list()).find((s) => s.key.endsWith('/U1'))?.value).toBe(10);
    const invalid = normalizeObservations(mqtt({ reported: { point: { U1: '10' } } }), profile);
    expect(invalid.signals[0]?.quality).toBe('INVALID');
  });
  it('retains older events and resolves alarms only on explicit clear', async () => {
    const store = new MemoryObservationStore();
    await store.commit(normalizeObservations(mqtt({ alarm: true }, { observedAt: time }), profile));
    await store.commit(
      normalizeObservations(
        mqtt({ alarm: false }, { observedAt: '2026-10-23T16:59:00Z' }),
        profile,
      ),
    );
    expect((await store.list())[0]?.alarmState).toBe('ACTIVE');
    await store.commit(normalizeObservations(mqtt({ alarm: 'unknown' }), profile));
    expect((await store.list())[0]?.alarmState).toBe('ACTIVE');
    await store.commit(
      normalizeObservations(
        mqtt({ alarm: false }, { observedAt: '2026-10-23T17:00:01Z' }),
        profile,
      ),
    );
    expect((await store.list())[0]?.alarmState).toBe('RESOLVED');
    expect(store.events.size).toBe(4);
  });
  it('deduplicates identifiers and rejects changed content under an existing ID', async () => {
    const store = new MemoryObservationStore();
    const a = normalizeObservations(mqtt({ x: 1 }, { messageId: 'one' }), profile);
    expect(await store.commit(a)).toBe('committed');
    expect(await store.commit(a)).toBe('duplicate');
    await expect(
      store.commit(normalizeObservations(mqtt({ x: 2 }, { messageId: 'one' }), profile)),
    ).rejects.toThrow('conflict');
  });
  it('can add a fourth source entirely by configuration with stable existing IDs', () => {
    const sources = parseProfiles(
      JSON.stringify([1, 2, 3, 4].map((i) => ({ ...profile, sourceIdentity: `EMU-${i}` }))),
    );
    const before = normalizeObservations(mqtt({ future: 3 }), profile).signals[0]!.id;
    const fourth = normalizeObservations(
      mqtt({ future: 3 }, { sourceIdentity: 'EMU-4' }),
      sources[3]!,
    );
    expect(fourth.signals[0]!.id).not.toBe(before);
    expect(normalizeObservations(mqtt({ future: 4 }), sources[0]!).signals[0]!.id).toBe(before);
  });
  it('rejects unsafe, oversized, deeply nested, ambiguous and unauthorized data', () => {
    expect(() => normalizeObservations(mqtt(JSON.parse('{"__proto__": 1}')), profile)).toThrow(
      'Unsafe',
    );
    expect(() => normalizeObservations(mqtt({ x: 'x'.repeat(270000) }), profile)).toThrow('large');
    expect(() =>
      normalizeObservations(mqtt({ x: 1 }, { sourceIdentity: 'wrong' }), profile),
    ).toThrow('mismatch');
    expect(() => parseProfiles(JSON.stringify([profile, profile]))).toThrow('Duplicate');
    expect(() =>
      parseProfiles(
        JSON.stringify([
          { ...profile, rules: [{ key: 'a', kind: 'alarm', activeValues: [1], clearValues: [1] }] },
        ]),
      ),
    ).toThrow('disjoint');
  });
  it('catalogs all 16 notifications and isolates Eltek alarm conditions by reported OID', () => {
    const unique = [...new Set(eltekNotifications.map((n) => n.oid))];
    expect(unique).toHaveLength(16);
    const p: SourceProfile = { ...profile, protocol: 'SNMP', mib: 'eltek-rev54', rules: [] };
    for (const notificationOid of unique) {
      const raw = {
        varbinds: [
          { oid: '1.3.6.1.4.1.12148.10.1.1.2.0', type: 6, value: '1.3.6.1.4.1.12148.10.2.1.0' },
          { oid: '1.3.6.1.4.1.12148.10.1.1.3.0', type: 2, value: 3 },
          { oid: '1.3.6.1.4.1.12148.10.1.1.4.0', type: 2, value: 1 },
          { oid: '1.3.6.1.4.1.99999.1.0', type: 4, value: { encoding: 'base64', bytes: 'AAEC' } },
        ],
      };
      const batch = normalizeObservations(
        {
          protocol: 'SNMP',
          sourceIdentity: 'EMU-1',
          transport: 'trap',
          receivedAt: time,
          notificationOid,
          raw,
        },
        p,
      );
      const heartbeat = eltekDefinition(notificationOid)?.name === 'infoHeartBeatTrap';
      expect(batch.signals.filter((s) => s.kind === 'alarm')).toHaveLength(heartbeat ? 0 : 1);
      expect(batch.signals.find((s) => s.key.includes('99999'))?.rawValue).toEqual({
        encoding: 'base64',
        bytes: 'AAEC',
      });
    }
  });
});
