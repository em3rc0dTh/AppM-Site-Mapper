import { describe, expect, it } from 'vitest';

import {
  electricalSummary,
  summaryValue,
} from '@/modules/power/application/connection-electrical-summary';

describe('read-only electrical feed summary', () => {
  const connections = [
    { breakerId: 'a' },
    { breakerId: 'a' }, // One breaker can declare multiple endpoints.
    { breakerId: 'b' },
  ];

  it('deduplicates breakers, ranges voltage, and sums distinct metrics', () => {
    const summary = electricalSummary(connections, {
      a: { voltageV: 52.1, currentA: 9.5, powerW: 495, energyKwh: 1.742 },
      b: { voltageV: 52.2, currentA: 10, powerW: 522, energyKwh: 1.837 },
    });

    expect(summary.breakerCount).toBe(2);
    expect(summary.voltage).toBe('52.1–52.2 V');
    expect(summary.current).toEqual({ value: 19.5, reporting: 2 });
    expect(summary.power).toEqual({ value: 1017, reporting: 2 });
    expect(summary.energy.value).toBeCloseTo(3.579, 5);
    expect(summaryValue(summary.power, summary.breakerCount, 3, 'kW', 1000)).toBe('1.017 kW');
  });

  it('does not fabricate readings and labels partial coverage', () => {
    const summary = electricalSummary(connections, {
      a: { voltageV: 52, currentA: 4, powerW: 208 },
    });

    expect(summary.voltage).toBe('52.0 V *');
    expect(summaryValue(summary.current, summary.breakerCount, 2, 'A')).toBe('4.00 A *');
    expect(summaryValue(summary.energy, summary.breakerCount, 3, 'kWh')).toBe('—');
  });

  it('keeps an empty/no-data feed unavailable instead of reporting zero', () => {
    const empty = electricalSummary([], {});
    expect(empty.voltage).toBe('—');
    expect(empty.current).toEqual({ reporting: 0 });
    expect(summaryValue(empty.current, empty.breakerCount, 2, 'A')).toBe('—');
  });
});
