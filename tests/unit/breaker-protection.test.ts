import { describe, expect, it } from 'vitest';

import { parseBreakerProtectionInput, readBreakerProtection } from '@/modules/power/domain/breaker-protection';

function input() {
  return {
    ratedCurrentA: 20,
    assertAboveA: 20,
    clearBelowA: 18,
    expectedRevision: 1,
    provenance: {source: 'PROVISIONAL_STANDARD', verified: false},
  };
}

describe('S01 breaker protection contract', () => {
  it('accepts a provisional rating and independent hysteresis', () => {
    expect(parseBreakerProtectionInput(input())).toMatchObject(input());
  });
  it('rejects a rating that claims field verification without evidence', () => {
    expect(() => parseBreakerProtectionInput({
      ...input(), provenance:{source:'FIELD_SURVEY',verified:true},
    })).toThrow('VERIFIED_RATING_REQUIRES_EVIDENCE');
  });
  it('accepts an evidenced, verified field rating', () => {
    expect(parseBreakerProtectionInput({
      ...input(), provenance:{source:'MANUFACTURER',verified:true,reference:'P/N ABC-123'},
      verificationConfirmed: true,
    }).provenance.verified).toBe(true);
  });
  it('refuses verified evidence without explicit operator confirmation', () => {
    expect(() => parseBreakerProtectionInput({
      ...input(),
      provenance: { source: 'MANUFACTURER', verified: true, reference: 'P/N CB-001' },
    })).toThrow('VERIFIED_RATING_REQUIRES_CONFIRMATION');
  });
  it('never certifies a provisional standard', () => {
    expect(() => parseBreakerProtectionInput({
      ...input(), provenance:{source:'PROVISIONAL_STANDARD',verified:true},
    })).toThrow('PROVISIONAL_RATING_CANNOT_BE_VERIFIED');
  });
  it('requires a positive nominal breaker rating', () => {
    for(const invalid of [0,-1,NaN,Infinity]) {
      expect(() => parseBreakerProtectionInput({...input(),ratedCurrentA:invalid})).toThrow('INVALID_BREAKER_LIMITS');
    }
  });
  it('rejects invalid and equal hysteresis thresholds', () => {
    expect(() => parseBreakerProtectionInput({...input(), clearBelowA:20})).toThrow('INVALID_BREAKER_HYSTERESIS');
    expect(() => parseBreakerProtectionInput({...input(), clearBelowA:21})).toThrow('INVALID_BREAKER_HYSTERESIS');
  });
  it('rejects unknown fields or stale/noninteger revisions', () => {
    expect(() => parseBreakerProtectionInput({...input(),tamper:true})).toThrow('INVALID_BREAKER_LIMITS');
    expect(() => parseBreakerProtectionInput({...input(),expectedRevision:1.5})).toThrow('INVALID_BREAKER_REVISION');
  });
  it('reads canonical stored attributes and rejects malformed values', () => {
    const stored = {
      ...input(), updatedAt:'2026-11-05T10:00:00Z',updatedBy:'operator',
    };
    expect(readBreakerProtection({breakerProtection:stored})).toMatchObject({
      ratedCurrentA:20, assertAboveA:20,clearBelowA:18,updatedBy:'operator',
    });
    expect(readBreakerProtection({breakerProtection:{ratedCurrentA:'20'}})).toBeNull();
  });
});
