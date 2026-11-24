import { describe, expect, it } from 'vitest';
import { projectSnmpController } from '@/modules/telemetry/application/snmp-controller-projection';
import { decodeSnmpText } from '@/modules/telemetry/domain/industrial/snmp-value';
import type { SnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

const now = Date.parse('2026-11-23T19:00:00.000Z');
const timestamp = new Date(now).toISOString();
const oids = ['1.3.6.1.4.1.9999.1.0', '1.3.6.1.4.1.9999.2.0', '1.3.6.1.4.1.9999.3.0', '1.3.6.1.4.1.9999.4.0'];
const profile: SnmpControllerProfile = {
  schemaVersion: 1, title: 'Controller', sourceIdentity: 'test-source',
  signals: [
    { oid: oids[0]!, label: 'Current', displayMode: 'NORMALIZED', metric: 'CURRENT' },
    { oid: oids[1]!, label: 'Branch', displayMode: 'RAW' },
    { oid: oids[2]!, label: 'Voltage', displayMode: 'NORMALIZED', metric: 'VOLTAGE' },
    { oid: oids[3]!, label: 'Status', displayMode: 'ENUM' },
  ],
  balance: {
    method: 'TOTAL_MINUS_BRANCH', totalOid: oids[0]!, branchOid: oids[1]!,
    voltageOid: oids[2]!, branchStatusOid: oids[3]!,
    normalization: { totalCurrentScale: 1, branchCurrentScale: 1, voltageScale: -0.01 },
  },
};
const load = {
  expectedFeedCount: 2, feedCount: 2, freshFeedCount: 0, labFreshFeedCount: 0,
  missingFeedPositions: [], configurationIssues: ['SHUNT_NOT_VERIFIED_A', 'SHUNT_NOT_VERIFIED_B'],
  feeds: [
    { accessPortId: 'a', side: 'A', ratedCurrentA: 1200 },
    { accessPortId: 'b', side: 'B', ratedCurrentA: 1200 },
  ],
} as unknown as SnmpBdfbLoadView;
function sample(key: string, rawValue: unknown, extra: Partial<Signal> = {}): Signal {
  return {
    id: key, key, sourceIdentity: profile.sourceIdentity, protocol: 'SNMP',
    targetId: null, kind: 'unknown', mibName: null, rawType: 'integer',
    rawValue, value: null, unit: null, scale: null, quality: 'UNKNOWN',
    alarmState: null, severity: null, profileVersion: 'test',
    receivedAt: timestamp, observedAt: timestamp, staleMs: 120000, eventId: 'round-1', ...extra,
  };
}
const readings = [
  sample(oids[0]!, 273), sample(oids[1]!, 132), sample(oids[2]!, 5374),
  sample(oids[3]!, 4, { quality: 'VALID', enumLabel: 'disabled' }),
];

describe('Controller projection is diagnostic and coherent', () => {
  it('uses one normalized source and preserves the disabled monitor state', () => {
    const p = projectSnmpController(profile, readings, load, now);
    expect(p.authority).toBe('DIAGNOSTIC_ONLY');
    expect(p.electrical).toMatchObject({ currentA: 273, voltageV: -53.74, ratedA: 2400, availableA: 2127 });
    expect(p.electrical.estimatedPowerKw).toBeCloseTo(14.67102);
    expect(p.inputs.map((s) => s.currentA)).toEqual([141, 132]);
    expect(p.inputs[1]?.monitorStatus).toBe('disabled');
    expect(p.diagnosticInputCount).toBe(2);
    expect(p.certifiedInputCount).toBe(0);
    expect(p.readings[0]?.reading).toMatchObject({ numericValue: 273, quality: 'DIAGNOSTIC', state: 'RECENT' });
  });
  it('does not combine polling rounds or ambiguous inputs', () => {
    const p = projectSnmpController(profile, readings.map((s) =>
      s.key === oids[1] ? { ...s, eventId: 'round-2' } : s), load, now);
    expect(p.inputs.every((s) => s.currentA === null)).toBe(true);
    const duplicate = projectSnmpController(profile, readings, {
      ...load, feeds: [load.feeds[0]!, { ...load.feeds[1]!, side: 'A' }],
    }, now);
    expect(duplicate.inputs).toHaveLength(0);
  });
  it('withholds stale measurements and mismatched latest observations', () => {
    expect(projectSnmpController(profile, readings, load, now + 120001).electrical.currentA).toBeNull();
    const retained = readings.map((s) => s.key === oids[0] ? {
      ...s, lastObservation: {
        eventId: 'newer', observedAt: timestamp, receivedAt: timestamp,
        quality: 'UNKNOWN' as const, rawValue: 999,
      },
    } : s);
    expect(projectSnmpController(profile, retained, load, now).electrical.currentA).toBeNull();
  });
});

describe('SNMP text and digital inputs', () => {
  it('decodes printable strings without interpreting binary DateAndTime as text', () => {
    expect(decodeSnmpText({ encoding: 'base64', bytes: 'Q3RybFVuaXRQb3dlcg==' })).toBe('CtrlUnitPower');
    expect(decodeSnmpText({ encoding: 'base64', bytes: 'B+oLFwwnBAA=' })).toBeNull();
  });
  it('groups a MIB row using its complete instance and decoded description', () => {
    const base = '1.3.6.1.4.1.12148.10.11.4.1.';
    const digital = [
      sample(base + '2.1.1', 1, { mibName: 'inputIoUnitProgInputStatus', quality: 'VALID', enumLabel: 'normal' }),
      sample(base + '3.1.1', { encoding: 'base64', bytes: 'QTMgRnVzZSBhbGFybQ==' }, { mibName: 'inputIoUnitProgInputDescription' }),
      sample(base + '5.1.1', 1, { mibName: 'inputIoUnitProgInputAlarmEnable', quality: 'VALID', enumLabel: 'enabled' }),
      sample(base + '6.1.1', 0, { mibName: 'inputIoUnitProgInputValue' }),
      sample(base + '7.1.1', 1, { mibName: 'inputIoUnitProgInputConfiguration', quality: 'VALID', enumLabel: 'normallyOpen' }),
    ];
    expect(projectSnmpController(profile, [...readings, ...digital], load, now).digitalInputs)
      .toMatchObject([{ label: 'A3 Fuse alarm', status: 'normal', enabled: true, value: 0, configuration: 'normallyOpen' }]);
  });
});
