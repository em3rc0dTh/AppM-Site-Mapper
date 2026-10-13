import { describe, expect, it } from 'vitest';
import { panelReportedPoints, telemetryMetrics } from '@/components/telemetry/telemetry-presentation';

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
