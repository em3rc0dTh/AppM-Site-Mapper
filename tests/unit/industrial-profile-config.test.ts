import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { configuredIndustrialProfiles } from '@/modules/telemetry/infrastructure/industrial/profile-config';

const makeProfile = (serial: string) => ({
  protocol: 'MQTT',
  sourceIdentity: serial,
  version: 'fixture-1',
  staleMs: 90000,
  rules: [
    {
      key: '/reported/0_1_1/U1',
      kind: 'measurement',
      unit: 'V',
      scale: 1,
      numericEncoding: 'decimal-string',
      evidence: 'Explicit synthetic profile test',
    },
  ],
});

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of dirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('industrial profile configuration', () => {
  it('loads a bounded approved file instead of the legacy JSON env value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'industrial-profiles-'));
    dirs.push(dir);
    const file = join(dir, 'profiles.json');
    writeFileSync(file, JSON.stringify([makeProfile('LAB-BDFB-02')]), 'utf8');
    vi.stubEnv('INDUSTRIAL_PROFILES_FILE', file);
    vi.stubEnv('INDUSTRIAL_PROFILES_JSON', JSON.stringify([makeProfile('ORIGINAL')]));
    expect(configuredIndustrialProfiles().map((profile) => profile.sourceIdentity)).toEqual([
      'LAB-BDFB-02',
    ]);
    // Changed on-disk evidence must be read, never assumed immutable across calls.
    writeFileSync(file, JSON.stringify([makeProfile('LAB-BDFB-03')]), 'utf8');
    expect(configuredIndustrialProfiles().map((profile) => profile.sourceIdentity)).toEqual([
      'LAB-BDFB-03',
    ]);
  });

  it('still supports original JSON-only installations', () => {
    vi.stubEnv('INDUSTRIAL_PROFILES_FILE', '');
    vi.stubEnv('INDUSTRIAL_PROFILES_JSON', JSON.stringify([makeProfile('EMU-BFDB-03')]));
    expect(configuredIndustrialProfiles()[0]?.sourceIdentity).toBe('EMU-BFDB-03');
  });

  it('fails closed if the configured file is missing', () => {
    vi.stubEnv('INDUSTRIAL_PROFILES_FILE', '/nonexistent/lab-profiles.json');
    vi.stubEnv('INDUSTRIAL_PROFILES_JSON', JSON.stringify([makeProfile('ORIGINAL')]));
    expect(() => configuredIndustrialProfiles()).toThrow();
  });
});
