import { describe, expect, it } from 'vitest';
import {
  breakerTelemetryMetrics,
  panelReportedPoints,
  resolveBreakerLiveMetrics,
  telemetryMetrics,
} from '@/components/telemetry/telemetry-presentation';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

describe('telemetry presentation truth boundary', () => {
  it('preserves explicit units and nested source labels without inventing units', () => {
    expect(
      telemetryMetrics({
        voltage: 48.2,
        sensor: { temperature: { value: 39.1, unit: '°C' } },
        online: false,
      }),
    ).toEqual([
      { label: 'voltage', value: '48.2' },
      { label: 'sensor / temperature', value: '39.1', unit: '°C' },
      { label: 'online', value: 'false' },
    ]);
  });
  it('presents canonical breaker power in kW without mutating the stored watt value', () => {
    const reading = { metrics: { powerW: { value: 9720 } } };
    expect(
      breakerTelemetryMetrics(reading as Parameters<typeof breakerTelemetryMetrics>[0]),
    ).toEqual([{ label: 'Power', value: '9.720', unit: 'kW' }]);
    expect(reading.metrics.powerW.value).toBe(9720);
  });

  it('renders canonical direct Equipment breaker telemetry from sample.reported', () => {
    const observedAt = '2026-11-19T22:20:00.000Z';
    const direct: TelemetrySample = {
      bindingId: 'binding-a3-03',
      targetId: 'breaker-a3-03',
      targetType: 'EQUIPMENT',
      entityId: 'breaker-a3-03',
      entityKind: 'EQUIPMENT',
      sourceIdentity: '26092403950002',
      sourcePointId: '0_3_3',
      metricBindingIds: ['v', 'i', 'p', 'e'],
      receivedAt: '2026-11-19T22:20:00.250Z',
      reported: {
        voltageV: { value: 52.41, unit: 'V', observedAt },
        currentA: { value: 7.8, unit: 'A', observedAt },
        powerW: { value: 408.798, unit: 'W', observedAt },
        energyKwh: { value: 12.3456, unit: 'kWh', observedAt },
      },
    };

    expect(resolveBreakerLiveMetrics(direct, 'breaker-a3-03')).toEqual({
      receivedAt: direct.receivedAt,
      voltageV: 52.41,
      currentA: 7.8,
      powerW: 408.798,
      energyKwh: 12.3456,
    });
  });

  it('retains aggregate breakerReadings as fallback when the sample is a parent projection', () => {
    const aggregate = {
      targetId: 'qdf-5',
      targetType: 'DEVICE',
      breakerReadings: [
        {
          breakerId: 'breaker-a3-03',
          receivedAt: '2026-11-19T22:21:00.000Z',
          metrics: {
            voltageV: { value: 53.1 },
            currentA: { value: 8.2 },
            powerW: { value: 435.42 },
            energyKwh: { value: 12.4 },
          },
        },
      ],
    } as unknown as TelemetrySample;

    expect(resolveBreakerLiveMetrics(aggregate, 'breaker-a3-03')).toEqual({
      receivedAt: '2026-11-19T22:21:00.000Z',
      voltageV: 53.1,
      currentA: 8.2,
      powerW: 435.42,
      energyKwh: 12.4,
    });
  });

  it('keeps zero values and omits null/arrays from the scalar overview', () => {
    expect(telemetryMetrics({ cpu: 0, missing: null, samples: [1, 2] })).toEqual([
      { label: 'cpu', value: '0' },
    ]);
  });
  it('preserves every reported point without mutating raw payload', () => {
    const packet = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field-${i}`, i]));
    const copy = JSON.stringify(packet);
    expect(telemetryMetrics(packet)).toHaveLength(100);
    expect(JSON.stringify(packet)).toBe(copy);
    expect(telemetryMetrics({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toEqual([]);
  });
  it('restricts only the panel view to the configured group and positional capacity', () => {
    const raw = {
      '0_1_1': { U1: 13.78, I1: 1.93 },
      '0_1_24': { U1: 12.3 },
      '0_1_25': { U1: 10 },
      '0_4_1': { U1: 20 },
      '0_10_1': { U1: 30 },
      serial: 'EMU-BFDB-03',
    };
    const copy = JSON.stringify(raw);
    expect(Object.keys(panelReportedPoints(raw, '0_1', 24))).toEqual(['0_1_1', '0_1_24']);
    expect(telemetryMetrics(panelReportedPoints(raw, '0_1', 24))).toHaveLength(3);
    expect(Object.keys(panelReportedPoints(raw, '0_3', 24))).toEqual([]);
    expect(panelReportedPoints(raw, undefined, 24)).toEqual(raw);
    expect(JSON.stringify(raw)).toBe(copy);
  });
});
