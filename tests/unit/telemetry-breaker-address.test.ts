import { describe, expect, it } from 'vitest';

import { parseBreakerAddress } from '@/modules/telemetry/domain/breaker-address';

describe('parseBreakerAddress', () => {
  it('preserves the opaque prefix and resolves panel/slot coordinates', () => {
    expect(parseBreakerAddress('0_1_1')).toEqual({
      ok: true,
      value: { prefix: 0, panelIndex: 1, breakerSlot: 1 },
    });
    expect(parseBreakerAddress('0_2_24')).toEqual({
      ok: true,
      value: { prefix: 0, panelIndex: 2, breakerSlot: 24 },
    });
  });

  it('enforces the proven 1..24 breaker-slot range without inventing a panel maximum', () => {
    expect(parseBreakerAddress('0_99_24').ok).toBe(true);
    expect(parseBreakerAddress('0_1_0')).toEqual({
      ok: false,
      error: 'INVALID_BREAKER_ADDRESS',
    });
    expect(parseBreakerAddress('0_1_25')).toEqual({
      ok: false,
      error: 'INVALID_BREAKER_ADDRESS',
    });
  });
});
