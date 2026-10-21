import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeController,
  sourceCredentialMap,
} from '@/modules/telemetry/application/snmp-ingest-credentials';
import { POST } from '@/app/api/telemetry/snmp/ingest/route';

const a = 'A'.repeat(48);
const b = 'B'.repeat(48);
const sources = JSON.stringify({ 'EMU-BFDB-01': a, 'EMU-BFDB-02': b });
function request(token: string, sourceIdentity = 'EMU-BFDB-01') {
  return new Request('https://mapper.example/api/telemetry/snmp/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({
      schemaVersion: 1,
      sourceIdentity,
      observedAt: new Date().toISOString(),
      measurements: [
        { oid: '1.3.6.1.4.1.8072.9999.2026.49.1.1.0', metric: 'CURRENT', unit: 'A', value: 220 },
      ],
    }),
  });
}
afterEach(() => vi.unstubAllEnvs());
describe('production SNMP collector identity authorization', () => {
  it('rejects invalid maps, short tokens and shared credentials', () => {
    for (const entry of [
      '',
      '[]',
      '{}',
      '{"x":"short"}',
      '{"x":"' + a + '","y":"' + a + '"}',
      '{"__proto__":"' + a + '"}',
    ])
      expect(() => sourceCredentialMap(entry)).toThrow();
  });
  it('authenticates a bearer for only its commissioned source, not others', () => {
    expect(authorizeController('Bearer ' + a, sources)).toBe('EMU-BFDB-01');
    expect(authorizeController('Bearer ' + b, sources)).toBe('EMU-BFDB-02');
    expect(authorizeController('Bearer ' + 'C'.repeat(48), sources)).toBeNull();
  });
  it('does not enable ingest in production without mandatory durable storage security', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('SNMP_INGEST_SOURCES_JSON', sources);
    vi.stubEnv('TELEMETRY_HISTORY_ENABLED', 'false');
    vi.stubEnv('TELEMETRY_STORE_TOKEN', 'S'.repeat(48));
    expect((await POST(request(a))).status).toBe(503);
  });
  it('rejects a valid collector bearer attempting to impersonate a different controller', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('SNMP_INGEST_SOURCES_JSON', sources);
    vi.stubEnv('TELEMETRY_HISTORY_ENABLED', 'true');
    vi.stubEnv('TELEMETRY_STORE_TOKEN', 'S'.repeat(48));
    expect((await POST(request(a, 'EMU-BFDB-02'))).status).toBe(403);
    expect((await POST(request('X'.repeat(48), 'EMU-BFDB-01'))).status).toBe(401);
  });
  it('returns 503 for malformed production credential configuration', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('SNMP_INGEST_SOURCES_JSON', '{"oops":"weak"}');
    vi.stubEnv('TELEMETRY_HISTORY_ENABLED', 'true');
    vi.stubEnv('TELEMETRY_STORE_TOKEN', 'S'.repeat(48));
    expect((await POST(request(a))).status).toBe(503);
  });
});
