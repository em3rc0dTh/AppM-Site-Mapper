import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('seed-01 SNMP Config2 runtime contract', () => {
  it('normalizes collector script permissions before dropping to USER node', () => {
    const dockerfile = source('infra/snmp-collector/Dockerfile');
    const chmod = dockerfile.indexOf('chmod 0644 /app/*.mjs');
    const user = dockerfile.indexOf('USER node');

    expect(chmod).toBeGreaterThan(-1);
    expect(user).toBeGreaterThan(chmod);
  });

  it('locks the three QDF source identities and Config2 OID tree', () => {
    const script = source('scripts/telemetry/commission-seed-01-snmp-config2.mongosh.js');

    expect(script).toContain("'QDF-2': 'EMU-DELTA-BFDB-01'");
    expect(script).toContain("'QDF-4': 'EMU-DELTA-BFDB-02'");
    expect(script).toContain("'QDF-5': 'EMU-DELTA-BFDB-03'");

    expect(script).toContain('1.3.6.1.4.1.8072.9999.2026.48.1.1.0');
    expect(script).toContain('1.3.6.1.4.1.8072.9999.2026.48.1.2.0');
    expect(script).toContain('1.3.6.1.4.1.8072.9999.2026.48.2.1.0');
    expect(script).toContain('1.3.6.1.4.1.8072.9999.2026.48.2.2.0');
  });

  it('keeps commissioning synthetic, additive and acknowledgement-gated', () => {
    const script = source('scripts/telemetry/commission-seed-01-snmp-config2.mongosh.js');

    expect(script).toContain("const MARK = 'SEED_01_SNMP_CONFIG2_V1'");
    expect(script).toContain("const PROFILE = 'ELTEK_BDCBB_CONFIG_2'");
    expect(script).toContain("ACK === 'SYNTHETIC_LAB_ONLY'");
    expect(script).toContain("independentInputConfirmed: false");
    expect(script).toContain("commissioning: 'SYNTHETIC_LAB_ONLY'");
    expect(script).toContain('MQTT/Modbus untouched');
  });
});
