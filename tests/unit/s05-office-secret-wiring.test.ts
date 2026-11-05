import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('S05 OFFICE secret wiring', () => {
  it('declares, generates and injects the credential encryption key without committing runtime secrets', () => {
    const template = read('infra/field/office-test.env.example');
    const init = read('infra/field/init-office-env.sh');
    const compose = read('docker-compose.telemetry.yml');
    const gitignore = read('.gitignore');

    expect(template).toContain('SITE_MAPPER_CREDENTIAL_KEY=CHANGE_ME');
    expect(init).toContain('SITE_MAPPER_CREDENTIAL_KEY="$(rand_hex 32)"');
    expect(init).toContain('"SITE_MAPPER_CREDENTIAL_KEY"');
    expect(compose).toContain(
      "SITE_MAPPER_CREDENTIAL_KEY: '${SITE_MAPPER_CREDENTIAL_KEY:?Set a private credential encryption key}'",
    );
    expect(gitignore).toContain('.runtime/');
  });

  it('does not place a real credential key value in the public template', () => {
    const template = read('infra/field/office-test.env.example');
    const match = template.match(/^SITE_MAPPER_CREDENTIAL_KEY=(.*)$/m);
    expect(match?.[1]).toBe('CHANGE_ME');
  });
});
