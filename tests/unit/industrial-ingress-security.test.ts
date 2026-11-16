import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndustrialInputError } from '@/modules/telemetry/domain/industrial/observations';
const mocks = vi.hoisted(() => ({ capture: vi.fn(), quota: vi.fn(), permission: vi.fn() }));
vi.mock('@/modules/telemetry/infrastructure/industrial/runtime', () => ({
  captureIndustrial: mocks.capture,
}));
vi.mock('@/modules/telemetry/application/snmp-ingest-rate-limit', () => ({
  reserveSnmpIngressQuota: mocks.quota,
}));
vi.mock('@/modules/identity/application/current-session', () => ({
  requirePermission: mocks.permission,
}));
import { POST } from '@/app/api/telemetry/industrial/ingest/route';
import { POST as project } from '@/app/api/telemetry/industrial/projection/route';
const token = 'unit-test-source-token-123456789012345';
const request = (body: unknown, auth = `Bearer ${token}`) =>
  new Request('http://localhost/api/telemetry/industrial/ingest', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const packet = {
  protocol: 'SNMP',
  transport: 'trap',
  sourceIdentity: 'EMU-1',
  raw: { varbinds: [{ oid: '1.3.6.1.4.1.99999.1.0', type: 2, value: 1 }] },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('INDUSTRIAL_INGEST_SOURCES_JSON', JSON.stringify({ 'EMU-1': token }));
  mocks.quota.mockResolvedValue(true);
  mocks.capture.mockResolvedValue({
    batch: { id: 'event', signals: [] },
    disposition: 'committed',
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('industrial ingestion trust boundaries', () => {
  it('has no session/cookie fallback and binds each secret to one source', async () => {
    expect((await POST(request(packet, 'Bearer wrong'))).status).toBe(401);
    expect((await POST(request({ ...packet, sourceIdentity: 'EMU-2' }))).status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it('enforces durable per-source quota before processing payloads', async () => {
    mocks.quota.mockResolvedValue(false);
    expect((await POST(request(packet))).status).toBe(429);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it('rejects write operations, unbounded bodies and unsafe keys', async () => {
    expect((await POST(request({ ...packet, transport: 'set' }))).status).toBe(400);
    expect((await POST(request({ ...packet, raw: { big: 'x'.repeat(262144) } }))).status).toBe(413);
    expect((await POST(request({ ...packet, raw: JSON.parse('{"__proto__":1}') }))).status).toBe(
      400,
    );
  });
  it('differentiates malformed data from unavailable storage and retains acquisition timestamp', async () => {
    mocks.capture.mockRejectedValueOnce(new IndustrialInputError('invalid'));
    expect((await POST(request(packet))).status).toBe(422);
    mocks.capture.mockRejectedValueOnce(new Error('database offline'));
    expect((await POST(request(packet))).status).toBe(503);
    const at = new Date(Date.now() - 60000).toISOString();
    expect((await POST(request({ ...packet, receivedAt: at }))).status).toBe(202);
    expect(mocks.capture.mock.calls.at(-1)?.[0].receivedAt).toBe(at);
  });
  it('protects the machine projection with a distinct credential', async () => {
    vi.stubEnv('INDUSTRIAL_PROJECTION_TOKEN', 'test-only-other-projection-token-123456789');
    expect((await project(request({ signalIds: [] }))).status).toBe(401);
  });
});
