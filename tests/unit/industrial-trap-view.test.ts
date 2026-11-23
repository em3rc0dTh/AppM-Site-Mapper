import { describe, expect, it } from 'vitest';

import type { Envelope, Signal } from '@/modules/telemetry/domain/industrial/observations';
import {
  configuredTrapSources,
  parseTrapCursor,
  parseTrapSources,
  presentTrap,
  trapCursor,
} from '@/modules/telemetry/domain/industrial/trap-view';
import { MemoryObservationStore } from '@/modules/telemetry/infrastructure/industrial/store';

const sourceA = 'test-source-A';
const sourceB = 'test-source-B';
const timestamp = '2026-11-23T20:00:00.000Z';
function envelope(sourceIdentity: string, transport = 'trap'): Envelope {
  return {
    protocol: 'SNMP',
    sourceIdentity,
    transport,
    receivedAt: timestamp,
    notificationOid: '1.3.6.1.4.1.12148.10.1.2.1',
    raw: {
      version: '2c',
      varbinds: [
        { oid: '1.3.6.1.4.1.12148.10.2.1.0', type: 2, value: 1 },
        { oid: '1.3.6.1.6.3.1.1.4.1.0', type: 6, value: '1.3.6.1.4.1.12148.10.1.2.1' },
      ],
    },
  };
}
function signal(alarmState: 'ACTIVE' | 'RESOLVED'): Signal {
  return {
    id: 's1',
    key: 'alarm:1',
    sourceIdentity: sourceA,
    protocol: 'SNMP',
    targetId: null,
    kind: 'alarm',
    mibName: null,
    rawType: 'integer',
    rawValue: 1,
    value: 1,
    unit: null,
    scale: null,
    quality: 'VALID',
    alarmState,
    severity: 'major',
    alarmCode: 'FIELD_ALARM',
    interpretation: 'PROFILE',
    profileVersion: 'test',
    receivedAt: timestamp,
    observedAt: timestamp,
    staleMs: 30000,
    eventId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };
}

describe('SNMP trap presentation', () => {
  it('does not fabricate severity/state for raw traps, including Eltek OIDs', () => {
    const result = presentTrap('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', envelope(sourceA));
    expect(result).toMatchObject({
      severity: null,
      alarmState: null,
      alarmCode: null,
      sourceIdentity: sourceA,
      varbindCount: 2,
    });
    expect(result?.varbinds[0]).toMatchObject({ value: '1' });
  });

  it('only displays event-specific normalized, verified alarm interpretation', () => {
    const result = presentTrap('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', envelope(sourceA), [
      signal('ACTIVE'),
    ]);
    expect(result).toMatchObject({
      severity: 'major',
      alarmState: 'ACTIVE',
      alarmCode: 'FIELD_ALARM',
    });
    const ambiguous = presentTrap('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', envelope(sourceA), [
      signal('ACTIVE'),
      signal('RESOLVED'),
    ]);
    expect(ambiguous?.alarmState).toBeNull();
  });

  it('rejects non-trap SNMP polling as well as MQTT events', () => {
    expect(presentTrap('id', envelope(sourceA, 'get'))).toBeNull();
    expect(presentTrap('id', { ...envelope(sourceA), protocol: 'MQTT' })).toBeNull();
  });

  it('requires explicit bounded source identity arrays', () => {
    expect(parseTrapSources([sourceA, sourceB])).toEqual([sourceA, sourceB]);
    expect(parseTrapSources([sourceA, sourceA])).toBeNull();
    expect(parseTrapSources(['../other'])).toBeNull();
    expect(configuredTrapSources({ snmpTrapSourceIdentities: [sourceA] })).toEqual([sourceA]);
  });

  it('validates tamper-safe pagination syntax without trusting a source in cursor', () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(parseTrapCursor(trapCursor(timestamp, id))).toEqual({ receivedAt: timestamp, id });
    expect(parseTrapCursor('not-a-cursor')).toBeNull();
  });
});

describe('Trap repository source isolation and pagination', () => {
  it('only lists the linked source, not unrelated QDF traps or polled GETs', async () => {
    const store = new MemoryObservationStore();
    const ids = [
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
    ];
    const rows = [
      envelope(sourceA),
      envelope(sourceA),
      envelope(sourceB),
      envelope(sourceA, 'get'),
    ];
    for (let i = 0; i < ids.length; i++) {
      await store.commit({
        id: ids[i]!,
        envelope: rows[i]!,
        signals: [],
      });
    }
    const first = await store.listTraps([sourceA], 1);
    expect(first.events.map((event) => event.id)).toEqual([ids[1]]);
    expect(first.nextCursor).toBeTruthy();
    const second = await store.listTraps([sourceA], 1, parseTrapCursor(first.nextCursor)!);
    expect(second.events.map((event) => event.id)).toEqual([ids[0]]);
    expect(second.nextCursor).toBeNull();
    expect((await store.listTraps([], 20)).events).toEqual([]);
  });
});
