import { describe, expect, it } from 'vitest';

import { authorizedSnmpCollector } from '@/app/api/telemetry/snmp/ingest/route';

describe('SNMP collector bearer boundary', () => {
  it('fails closed with absent or short secrets, including in development', () => {
    expect(authorizedSnmpCollector('Bearer abc', undefined)).toBe(false);
    expect(authorizedSnmpCollector('Bearer abc', 'abc')).toBe(false);
  });
  it('requires the exact bearer token', () => {
    const token = 'a'.repeat(64);
    expect(authorizedSnmpCollector(`Bearer ${token}`, token)).toBe(true);
    expect(authorizedSnmpCollector('Bearer ' + 'b'.repeat(64), token)).toBe(false);
    expect(authorizedSnmpCollector(token, token)).toBe(false);
  });
});
