import { describe, expect, it } from 'vitest';

import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { TelemetrySource } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryLatestRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-latest-repository';
import { MemoryTelemetrySourceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-source-repository';

const timestamp = '2026-09-22T00:00:00.000Z';

function source(overrides: Partial<TelemetrySource> = {}): TelemetrySource {
  return {
    id: 'source-1',
    entityId: 'equipment-1',
    entityKind: 'EQUIPMENT',
    topicSource: 'mqtt-source-1',
    expectedSerialNumber: 'SN-E',
    protocolProfile: 'telxius-v1',
    rawSchemaVersion: 'telxius-v1',
    staleAfterSeconds: 30,
    enabled: true,
    ...overrides,
  };
}

function serviceWith(sources: readonly TelemetrySource[]) {
  const hub = new TelemetryHub(4);
  const latest = new MemoryTelemetryLatestRepository();
  const service = new TelemetryService(new MemoryTelemetrySourceRepository(sources), latest, hub, {
    topicPrefix: 'appmanager/v1/raw/',
    topicSuffix: '/telemetry',
    maxPayloadBytes: 1024,
  });

  return { service, hub, latest };
}

describe('TelemetryService', () => {
  it('binds topic source to a registered Device/Equipment and verifies payload sn', async () => {
    const { service } = serviceWith([source()]);

    const result = await service.ingest(
      'appmanager/v1/raw/mqtt-source-1/telemetry',
      new TextEncoder().encode(JSON.stringify({ sn: 'SN-E', reported: { '0_1_1': { u: 48 } } })),
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect((await service.latest('equipment-1'))?.reported).toEqual({
      '0_1_1': { u: 48 },
    });
    expect((await service.latest('equipment-1'))?.serialNumber).toBe('SN-E');
  });

  it('rejects unknown, disabled and forged serial bindings', async () => {
    const { service } = serviceWith([
      source(),
      source({ id: 'source-2', topicSource: 'disabled', enabled: false }),
    ]);

    expect(
      await service.ingest(
        'appmanager/v1/raw/missing/telemetry',
        new TextEncoder().encode(JSON.stringify({ sn: 'SN-E', reported: {} })),
        timestamp,
      ),
    ).toEqual({ ok: false, error: 'UNKNOWN_SOURCE' });

    expect(
      await service.ingest(
        'appmanager/v1/raw/disabled/telemetry',
        new TextEncoder().encode(JSON.stringify({ sn: 'SN-E', reported: {} })),
        timestamp,
      ),
    ).toEqual({ ok: false, error: 'SOURCE_DISABLED' });

    expect(
      await service.ingest(
        'appmanager/v1/raw/mqtt-source-1/telemetry',
        new TextEncoder().encode(JSON.stringify({ sn: 'SN-FORGED', reported: {} })),
        timestamp,
      ),
    ).toEqual({ ok: false, error: 'SOURCE_IDENTITY_MISMATCH' });
  });

  it('does not let an older observation replace durable latest state', async () => {
    const { service } = serviceWith([source()]);

    await service.ingest(
      'appmanager/v1/raw/mqtt-source-1/telemetry',
      new TextEncoder().encode(
        JSON.stringify({
          sn: 'SN-E',
          observedAt: '2026-09-22T00:00:10.000Z',
          reported: { '0_1_1': { u: 50 } },
        }),
      ),
      '2026-09-22T00:00:11.000Z',
    );

    await service.ingest(
      'appmanager/v1/raw/mqtt-source-1/telemetry',
      new TextEncoder().encode(
        JSON.stringify({
          sn: 'SN-E',
          observedAt: '2026-09-22T00:00:05.000Z',
          reported: { '0_1_1': { u: 40 } },
        }),
      ),
      '2026-09-22T00:00:12.000Z',
    );

    expect((await service.latest('equipment-1'))?.reported).toEqual({
      '0_1_1': { u: 50 },
    });
  });

  it('enforces stream subscriber capacity', () => {
    const hub = new TelemetryHub(1);
    const first = hub.subscribe(() => undefined);
    const second = hub.subscribe(() => undefined);

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    first?.();
    expect(hub.subscriberCount()).toBe(0);
  });
});
