import { describe, expect, it } from 'vitest';

import {
  BFDB_V1_DEFAULT_POWER_SOURCE_UNIT,
  normalizePowerToWatts,
  resolvePowerSourceUnit,
  wattsToKilowatts,
} from '@/modules/telemetry/domain/power-unit-contract';

describe('power unit contract', () => {
  it('defaults BFDB v1 source power to watts', () => {
    expect(BFDB_V1_DEFAULT_POWER_SOURCE_UNIT).toBe('W');
    expect(resolvePowerSourceUnit(undefined)).toBe('W');
    expect(normalizePowerToWatts('55.62')).toBe(55.62);
  });

  it('normalizes an explicitly declared kW source into canonical watts', () => {
    expect(normalizePowerToWatts('0.05562', 'kW')).toBeCloseTo(55.62, 10);
    expect(normalizePowerToWatts('-0.04379', 'kW')).toBeCloseTo(-43.79, 10);
  });

  it('rejects unsupported source units instead of guessing', () => {
    expect(resolvePowerSourceUnit('MW')).toBeNull();
    expect(normalizePowerToWatts(1, 'MW')).toBeUndefined();
  });

  it('converts canonical watts to contractual kilowatts', () => {
    expect(wattsToKilowatts(55.62)).toBeCloseTo(0.05562, 10);
  });
});
