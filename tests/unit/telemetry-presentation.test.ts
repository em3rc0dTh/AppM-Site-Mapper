import { describe, expect, it } from 'vitest';
import { telemetryMetrics } from '@/components/telemetry/telemetry-presentation';

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
  it('bounds nested and oversized packets without mutating raw payload', () => {
    const packet = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field-${i}`, i]));
    const copy = JSON.stringify(packet);
    expect(telemetryMetrics(packet)).toHaveLength(24);
    expect(JSON.stringify(packet)).toBe(copy);
    expect(telemetryMetrics({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toEqual([]);
  });
});
