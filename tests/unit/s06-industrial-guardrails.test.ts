import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('S06 industrial guardrails', () => {
  it('allows dnsmasq netlink while keeping the DNS unit sandboxed', () => {
    const unit = source('infra/field/ops/systemd/site-mapper-dns.service');

    expect(unit).toContain('RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK');
    expect(unit).toContain('NoNewPrivileges=true');
    expect(unit).toContain('ProtectSystem=strict');
  });

  it('never recreates or restarts the industrial stack from the host resilience installer', () => {
    const installer = source('infra/field/ops/install-host-resilience.sh');

    expect(installer).not.toContain('docker compose');
    expect(installer).not.toContain('--force-recreate');
    expect(installer).not.toContain('--remove-orphans');
    expect(installer).not.toContain('systemctl restart kea-dhcp4-server');
    expect(installer).not.toContain('docker restart');
    expect(installer).toContain('S06_KEA_PUBLISH');
    expect(installer).toContain('Kea candidate staged only');
    expect(installer).toContain('mktemp /etc/kea/.site-mapper-s06.XXXXXX');
    expect(installer).toContain('chmod 0644 "$kea_tmp"');
  });

  it('fails closed unless the live Site Mapper industrial contract is intact', () => {
    const installer = source('infra/field/ops/install-host-resilience.sh');

    expect(installer).toContain('INDUSTRIAL_INGEST_SOURCES_JSON');
    expect(installer).toContain('INDUSTRIAL_PROFILES_JSON');
    expect(installer).toContain('definitely-invalid-probe-token');
    expect(installer).toContain('expected HTTP 401');
    expect(installer).not.toContain('python3 - "$industrial_env"');
    expect(installer).toContain("python3 -c '");
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

  it('provides one canonical TFARM Site Mapper recreate path with SNMP overlay', () => {
    const recreate = source('scripts/operations/recreate-site-mapper-tfarm.sh');

    expect(recreate).toContain('docker-compose.telemetry.yml');
    expect(recreate).toContain('docker-compose.office-test.yml');
    expect(recreate).toContain('docker-compose.snmp-field.yml');
    expect(recreate).toContain('deployment/compose.tfarm.yml');
    expect(recreate).toContain('--profile snmp');
    expect(recreate).toContain('--no-deps');
    expect(recreate).toContain('--no-build');
    expect(recreate).toContain('--force-recreate');
    expect(recreate).toContain('expected HTTP 401');
    expect(recreate).toContain('config --format json |');
    expect(recreate).not.toContain('model="$(');
    expect(recreate).not.toContain('snmp-traps');
    expect(recreate).not.toContain('mosquitto');
  });
});
