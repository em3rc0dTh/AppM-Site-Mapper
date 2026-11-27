import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('S06 industrial guardrails', () => {
  it('never recreates or restarts the industrial stack from the host resilience installer', () => {
    const installer = source('infra/field/ops/install-host-resilience.sh');

    expect(installer).not.toContain('docker compose');
    expect(installer).not.toContain('--force-recreate');
    expect(installer).not.toContain('--remove-orphans');
    expect(installer).not.toContain('systemctl restart kea-dhcp4-server');
    expect(installer).not.toContain('docker restart');
    expect(installer).toContain('S06_KEA_PUBLISH');
    expect(installer).toContain('Kea candidate staged only');
  });

  it('fails closed unless the live Site Mapper industrial contract is intact', () => {
    const installer = source('infra/field/ops/install-host-resilience.sh');

    expect(installer).toContain('INDUSTRIAL_INGEST_SOURCES_JSON');
    expect(installer).toContain('INDUSTRIAL_PROFILES_JSON');
    expect(installer).toContain('definitely-invalid-probe-token');
    expect(installer).toContain('expected HTTP 401');
  });

  it('blocks watchdog recovery when industrial mappings are missing or inconsistent', () => {
    const watchdog = source('infra/field/ops/watchdog.py');

    expect(watchdog).toContain('def industrial_contract()');
    expect(watchdog).toContain('industrial_contract_block');
    expect(watchdog).toContain('INDUSTRIAL_INGEST_SOURCES_JSON');
    expect(watchdog).toContain('INDUSTRIAL_PROFILES_JSON');
    expect(watchdog).toContain('"mosquitto"');
    expect(watchdog).toContain('"snmp-traps"');
    expect(watchdog).toContain('"snmp-collector"');
  });
});
