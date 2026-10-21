import { describe, expect, it } from 'vitest';
import {
  snmpIngressQuotaKey,
  snmpIngressQuotaLimit,
} from '@/modules/telemetry/application/snmp-ingest-rate-limit';

describe('distributed SNMP request quota configuration', () => {
  it('has a bounded per-controller default and refuses invalid overrides', () => {
    expect(snmpIngressQuotaLimit(undefined)).toBe(120);
    expect(snmpIngressQuotaLimit('30')).toBe(30);
    for (const candidate of ['0', '-1', '3.1', 'NaN', '10001', 'Infinite']) {
      expect(() => snmpIngressQuotaLimit(candidate)).toThrow();
    }
  });
  it('uses independent minute buckets per authorized source', () => {
    expect(snmpIngressQuotaKey('BFDB-01', 60_000)).toBe('BFDB-01:1');
    expect(snmpIngressQuotaKey('BFDB-01', 119_999)).toBe('BFDB-01:1');
    expect(snmpIngressQuotaKey('BFDB-02', 60_000)).toBe('BFDB-02:1');
    expect(() => snmpIngressQuotaKey('__proto__', 60_000)).not.toThrow();
    expect(() => snmpIngressQuotaKey('illegal/id', 60_000)).toThrow();
  });
});
