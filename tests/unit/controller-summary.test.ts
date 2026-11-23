import { describe, expect, it, vi } from 'vitest';
import template from '../../config/industrial/smartpack2-controller.template.json';
import oids from '../../config/industrial/smartpack2-poll-oids.example.json';
import { parseSnmpControllerProfile } from '@/modules/telemetry/domain/snmp-controller-profile';
import {
  presentControllerReading,
  type SnmpControllerObservation,
} from '@/modules/telemetry/application/snmp-controller-presentation';
import {
  controllerSummary,
  configuredControllerCapacity,
} from '@/modules/telemetry/application/controller-summary';
import { fetchControllerSignals } from '@/modules/telemetry/application/controller-signals-client';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';

const profile = parseSnmpControllerProfile(template)!;
const currentSpec = profile.signals.find((s) => s.metric === 'CURRENT')!;
const voltageSpec = profile.signals.find((s) => s.metric === 'VOLTAGE')!;
const now = Date.parse('2026-11-23T18:00:00Z');
const sample = (key: string, value: number, unit: string): SnmpControllerObservation => ({
  key,
  sourceIdentity: profile.sourceIdentity,
  protocol: 'SNMP',
  value,
  rawValue: value,
  unit,
  scale: 1,
  interpretation: 'PROFILE',
  quality: 'VALID',
  staleMs: 130000,
  observedAt: new Date(now).toISOString(),
  receivedAt: new Date(now).toISOString(),
});
const current = sample(currentSpec.oid, 273, 'A');
const voltage = { ...sample(voltageSpec.oid, 53.74, 'V'), rawValue: 5374, scale: 0.01 };

describe('General controller summary without physical feed commissioning', () => {
  it('preserves the original OIDs and adds candidate plus separate channel/alarm states', () => {
    expect(profile.signals.map((s) => s.oid)).toEqual(oids);
    expect(profile.signals).toHaveLength(6);
    expect(profile.signals.find((s) => s.oid.endsWith('18.7.1.6.1'))).toMatchObject({
      displayMode: 'RAW',
    });
    expect(profile.signals.filter((s) => s.metric)).toHaveLength(2);
  });
  it('uses normalized API values once, retaining exact RAW and provenance', () => {
    expect(presentControllerReading(voltage, voltageSpec, now)).toMatchObject({
      text: '53.74 V',
      raw: '5374',
      numericValue: 53.74,
    });
    expect(controllerSummary(profile, [current, voltage], now)).toEqual({
      currentA: 273,
      voltageV: 53.74,
      estimatedPowerKw: 14.67102,
    });
  });
  it.each([
    { quality: 'UNKNOWN' },
    { quality: 'INVALID' },
    { quality: 'OFFLINE' },
    { quality: 'STALE' },
    { scale: null },
    { scale: 0 },
    { unit: 'mA' },
    { interpretation: 'UNINTERPRETED' },
    { value: NaN },
    { value: '273' },
    { value: null },
    { staleMs: 0 },
    { observedAt: new Date(now - 130001).toISOString() },
    { observedAt: new Date(now + 10001).toISOString() },
    { lastObservation: { rawValue: 999, observedAt: new Date(now + 1).toISOString() } },
  ])('does not promote unusable observations: %j', (patch) => {
    expect(
      controllerSummary(profile, [{ ...current, ...patch }, voltage], now).currentA,
    ).toBeNull();
    expect(
      controllerSummary(profile, [{ ...current, ...patch }, voltage], now).estimatedPowerKw,
    ).toBeNull();
  });
  it('honors source TTL even before the controller presentation TTL', () => {
    expect(
      presentControllerReading({ ...current, staleMs: 1000 }, currentSpec, now + 1001).numericValue,
    ).toBeNull();
  });
  it('does not estimate power across asynchronous samples or a different source', () => {
    const older = { ...voltage, observedAt: new Date(now - 5001).toISOString() };
    expect(controllerSummary(profile, [current, older], now)).toMatchObject({
      currentA: 273,
      voltageV: 53.74,
      estimatedPowerKw: null,
    });
    expect(
      controllerSummary(profile, [{ ...current, sourceIdentity: 'another-device' }, voltage], now)
        .currentA,
    ).toBeNull();
    expect(controllerSummary(profile, [current, current, voltage], now).currentA).toBeNull();
  });
  it('preserves real zero and signed values and never derives A3 from B3', () => {
    expect(
      controllerSummary(profile, [{ ...current, value: 0, rawValue: 0 }, voltage], now)
        .estimatedPowerKw,
    ).toBe(0);
    expect(
      controllerSummary(profile, [{ ...current, value: -273 }, voltage], now).estimatedPowerKw,
    ).toBe(-14.67102);
    expect(
      Object.keys(controllerSummary(profile, [current, voltage, sample(oids[3]!, 132, 'A')], now)),
    ).toEqual(['currentA', 'voltageV', 'estimatedPowerKw']);
  });
  it('rejects ambiguous role assignments and scaling fields in display profiles', () => {
    expect(
      parseSnmpControllerProfile({
        ...template,
        signals: [...template.signals, { ...currentSpec, oid: '1.3.6.1.4.1.9876.1' }],
      }),
    ).toBeNull();
    expect(
      parseSnmpControllerProfile({ ...template, signals: [{ ...currentSpec, scale: 0.01 }] }),
    ).toBeNull();
    expect(
      parseSnmpControllerProfile({
        ...template,
        signals: [{ ...currentSpec, displayMode: 'RAW' }],
      }),
    ).toBeNull();
  });
});

const load = {
  expectedFeedCount: 2,
  feedCount: 2,
  missingFeedPositions: [],
  configurationIssues: ['SHUNT_NOT_VERIFIED_A', 'SHUNT_NOT_VERIFIED_B'],
  feeds: [
    { accessPortId: 'a', side: 'A', ratedCurrentA: 1200 },
    { accessPortId: 'b', side: 'B', ratedCurrentA: 1200 },
  ],
} as unknown as SnmpBdfbLoadView;
describe('Configured nameplate capacity', () => {
  it('reads complete configured ratings without promoting measured utilization', () => {
    expect(configuredControllerCapacity(load)).toBe(2400);
    expect(configuredControllerCapacity(null)).toBeNull();
  });
  it('rejects partial, duplicate, invalid and conflicting inventory', () => {
    expect(configuredControllerCapacity({ ...load, feeds: [load.feeds[0]!] })).toBeNull();
    expect(
      configuredControllerCapacity({ ...load, feeds: [load.feeds[0]!, load.feeds[0]!] }),
    ).toBeNull();
    expect(
      configuredControllerCapacity({ ...load, configurationIssues: ['DUPLICATE_PANEL_MAPPING'] }),
    ).toBeNull();
    expect(
      configuredControllerCapacity({
        ...load,
        feeds: load.feeds.map((f) => ({ ...f, ratedCurrentA: Infinity })),
      }),
    ).toBeNull();
  });
});

describe('Paginated industrial catalog', () => {
  it('finds an OID on a later page', async () => {
    const cursor = 'a'.repeat(64);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ signals: [current], truncated: true, nextCursor: cursor }),
      )
      .mockResolvedValueOnce(
        Response.json({ signals: [voltage], truncated: false, nextCursor: null }),
      );
    expect(await fetchControllerSignals(profile.sourceIdentity, undefined, request)).toEqual([
      current,
      voltage,
    ]);
    expect(String(request.mock.calls[1]![0])).toContain('cursor=' + cursor);
  });
  it('fails closed on a later page authorization failure', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ signals: [current], truncated: true, nextCursor: 'a'.repeat(64) }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(
      fetchControllerSignals(profile.sourceIdentity, undefined, request),
    ).rejects.toThrow('HTTP 401');
  });
  it('rejects repeated cursors and cross-source results', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ signals: [], truncated: true, nextCursor: 'a'.repeat(64) }),
      );
    await expect(
      fetchControllerSignals(profile.sourceIdentity, undefined, request),
    ).rejects.toThrow('INVALID_SIGNAL_CURSOR');
    const other = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ signals: [{ ...current, sourceIdentity: 'wrong' }], truncated: false }),
      );
    await expect(fetchControllerSignals(profile.sourceIdentity, undefined, other)).rejects.toThrow(
      'INVALID_SIGNAL_SOURCE',
    );
  });
});
