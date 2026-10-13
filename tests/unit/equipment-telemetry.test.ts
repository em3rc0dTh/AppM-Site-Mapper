import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { entityTelemetryStatus } from '@/modules/telemetry/domain/entity-status';
import { HttpTelemetryStore } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const sample: TelemetrySample = {
  targetId: 'equipment',
  targetType: 'EQUIPMENT',
  entityId: 'equipment',
  entityKind: 'EQUIPMENT',
  sourceIdentity: 'SN-A',
  bindingId: 'binding-a',
  receivedAt: '2026-10-12T22:00:00Z',
  reported: { temperature: { value: 33, unit: 'C' } },
};
afterEach(() => vi.unstubAllGlobals());

describe('Equipment telemetry isolation and history', () => {
  it('does not merge measurements from different source bindings on the same target', () => {
    const hub = new TelemetryHub(2);
    hub.publish(sample);
    hub.publish({
      ...sample,
      sourceIdentity: 'SN-B',
      bindingId: 'binding-b',
      reported: { power: 44 },
    });
    expect(hub.latest('equipment')?.reported).toEqual({ power: 44 });
  });
  it('distinguishes unmapped, empty, live, stale and offline using measurement time', () => {
    const now = Date.parse(sample.receivedAt);
    expect(entityTelemetryStatus(false, null, now)).toBe('UNMAPPED');
    expect(entityTelemetryStatus(true, null, now)).toBe('NO DATA');
    expect(entityTelemetryStatus(true, sample, now)).toBe('LIVE');
    expect(entityTelemetryStatus(true, sample, now + 31_000)).toBe('STALE');
    expect(entityTelemetryStatus(true, sample, now + 301_000)).toBe('OFFLINE');
    expect(
      entityTelemetryStatus(true, { ...sample, sourceObservedAt: '2025-01-01T00:00:00Z' }, now),
    ).toBe('OFFLINE');
  });
  it('writes non-BDFB metrics with exact identity and queries history by target rather than SN', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"accepted":1}', { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ samples: [sample] })));
    vi.stubGlobal('fetch', fetchMock);
    const store = new HttpTelemetryStore('http://store', 1000, 'test-token');
    await store.write(sample);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ entitySample: sample });
    expect(await store.queryEntity('equipment', 'EQUIPMENT', '7d')).toEqual([sample]);
    const url = fetchMock.mock.calls[1]![0] as URL;
    expect(url.searchParams.get('targetId')).toBe('equipment');
    expect(url.searchParams.get('targetType')).toBe('EQUIPMENT');
    expect(url.searchParams.has('serial')).toBe(false);
  });
});
