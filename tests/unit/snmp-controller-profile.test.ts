import { describe, expect, it } from 'vitest';
import {
  controllerProfileFromAttributes,
  parseSnmpControllerProfile,
} from '@/modules/telemetry/domain/snmp-controller-profile';
import {
  presentControllerReading,
  SNMP_CONTROLLER_MAX_AGE_MS,
} from '@/modules/telemetry/application/snmp-controller-presentation';

const profile = {
  schemaVersion: 1,
  title: 'Field controller',
  sourceIdentity: 'controller-01',
  signals: [
    { oid: '1.3.6.1.4.1.1234.5.6.0', label: 'System', displayMode: 'ENUM' },
    { oid: '1.3.6.1.4.1.1234.5.7.0', label: 'Current raw', displayMode: 'RAW' },
  ],
};
const now = Date.parse('2026-11-23T18:00:00Z');
const rawSpec = profile.signals[1]! as {
  oid: string;
  label: string;
  displayMode: 'RAW';
};

describe('Device-scoped SNMP controller profile', () => {
  it('accepts independent installation metadata without implying feed bindings', () => {
    const parsed = parseSnmpControllerProfile(profile);
    expect(parsed?.sourceIdentity).toBe('controller-01');
    expect(parsed?.signals).toHaveLength(2);
    expect(controllerProfileFromAttributes({ snmpControllerProfile: profile })).toEqual(parsed);
  });

  it('rejects duplicate OIDs, unknown fields, invalid sources and absent signals', () => {
    expect(parseSnmpControllerProfile({ ...profile, signals: [profile.signals[0], profile.signals[0]] })).toBeNull();
    expect(parseSnmpControllerProfile({ ...profile, feed: 'A' })).toBeNull();
    expect(parseSnmpControllerProfile({ ...profile, sourceIdentity: '../controller' })).toBeNull();
    expect(parseSnmpControllerProfile({ ...profile, signals: [] })).toBeNull();
  });

  it('preserves raw readings without inventing amperes or volts', () => {
    const observed = {
      key: rawSpec.oid,
      rawValue: 273,
      value: 273,
      quality: 'UNKNOWN',
      receivedAt: new Date(now).toISOString(),
    };
    expect(presentControllerReading(observed, rawSpec, now)).toMatchObject({
      state: 'RECENT',
      text: '273',
      quality: 'UNKNOWN',
    });
  });

  it('uses independent per-OID timestamps and treats future/stale/null as unavailable', () => {
    const sample = {
      key: rawSpec.oid,
      rawValue: 273,
      value: null,
      quality: 'VALID',
      receivedAt: new Date(now).toISOString(),
    };
    expect(
      presentControllerReading(
        { ...sample, receivedAt: new Date(now - SNMP_CONTROLLER_MAX_AGE_MS - 1).toISOString() },
        rawSpec,
        now,
      ).state,
    ).toBe('STALE');
    expect(presentControllerReading({ ...sample, rawValue: null }, rawSpec, now).state).toBe('INVALID');
    expect(
      presentControllerReading(
        { ...sample, receivedAt: new Date(now + 100_000).toISOString() },
        rawSpec,
        now,
      ).state,
    ).toBe('INVALID');
    expect(presentControllerReading(undefined, rawSpec, now).state).toBe('UNAVAILABLE');
  });

  it('uses an observed enum label only when explicitly requested', () => {
    const spec = { ...rawSpec, displayMode: 'ENUM' as const };
    const observation = {
      key: spec.oid,
      rawValue: 1,
      value: 1,
      quality: 'VALID',
      enumLabel: 'Normal',
      receivedAt: new Date(now).toISOString(),
    };
    expect(presentControllerReading(observation, spec, now).text).toBe('Normal (1)');
    expect(presentControllerReading(observation, rawSpec, now).text).toBe('1');
  });
});
