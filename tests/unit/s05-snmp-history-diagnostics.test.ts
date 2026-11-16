import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpTelemetryStore } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const sample: TelemetrySample = {
  bindingId: 'snmp:CTRL:feed-a',
  metricBindingIds: ['binding-current'],
  targetId: 'feed-a',
  targetType: 'ACCESS_PORT',
  entityId: 'feed-a',
  entityKind: 'ACCESS_PORT',
  sourceIdentity: 'CTRL',
  reported: {
    currentA: {
      value: 10,
      unit: 'A',
      oid: '1.3.6.1.4.1.999.1',
      observedAt: '2026-11-05T10:00:00.000Z',
    },
  },
  receivedAt: '2026-11-05T10:00:00.100Z',
  sourceObservedAt: '2026-11-05T10:00:00.000Z',
  protocol: 'SNMP',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('S05 SNMP history diagnostics', () => {
  it('records transport failure and clears lastError after a later successful atomic commit', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect refused'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'committed', acceptedFeeds: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const store = new HttpTelemetryStore('http://telemetry-store:8080');

    await expect(
      store.commitSnmpBatch('CTRL', '2026-11-05T10:00:00.000Z', [sample]),
    ).rejects.toThrow('connect refused');

    expect(store.diagnostics()).toMatchObject({
      failures: 1,
      lastError: 'connect refused',
      writes: 0,
      rowsAccepted: 0,
    });

    await expect(store.commitSnmpBatch('CTRL', '2026-11-05T10:00:01.000Z', [sample])).resolves.toBe(
      'committed',
    );

    const recovered = store.diagnostics();
    expect(recovered.failures).toBe(1);
    expect(recovered.lastError).toBeNull();
    expect(recovered.writes).toBe(1);
    expect(recovered.rowsAccepted).toBe(1);
    expect(recovered.lastWriteAt).not.toBeNull();
  });

  it('records a rejected atomic batch acknowledgement as a diagnostic failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'store unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const store = new HttpTelemetryStore('http://telemetry-store:8080');

    await expect(
      store.commitSnmpBatch('CTRL', '2026-11-05T10:00:00.000Z', [sample]),
    ).rejects.toThrow('SNMP_BATCH_HTTP_503');

    expect(store.diagnostics()).toMatchObject({
      failures: 1,
      lastError: 'SNMP_BATCH_HTTP_503',
      writes: 0,
    });
  });
});
