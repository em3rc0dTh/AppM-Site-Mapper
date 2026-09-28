import { describe, expect, it } from 'vitest';

import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-22T00:00:00.000Z';

function device(id: string, serialNumber: string): DeviceNode {
  return {
    id,
    parentId: 'rack',
    name: id,
    kind: 'DEVICE',
    pinned: false,
    serialNumber,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function bdfbDevice(id: string): DeviceNode {
  return {
    ...device(id, 'LOCAL-BFDB-01'),
    bdfb: {
      shelves: [
        {
          id: 'shelf-a',
          label: 'Shelf A',
          frames: [
            {
              id: 'frame-a',
              label: 'Frame A',
              panels: [
                {
                  id: 'panel-a1',
                  label: 'A1',
                  endpoints: [
                    { id: 'breaker-1', variant: 'BREAKER', label: 'CB-01' },
                    { id: 'breaker-2', variant: 'BREAKER', label: 'CB-02' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function equipment(id: string, serialNumber: string): EquipmentNode {
  return {
    id,
    parentId: 'rack',
    name: id,
    kind: 'EQUIPMENT',
    pinned: false,
    serialNumber,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('TelemetryService', () => {
  it('maps generic telemetry to sibling Device and Equipment by external serial identity', async () => {
    const repository = new MemoryTopologyRepository([
      device('device-1', 'SN-D'),
      equipment('equipment-1', 'SN-E'),
    ]);
    const hub = new TelemetryHub(4);
    const service = new TelemetryService(repository, hub, {
      topicPrefix: 'data/dev/',
      maxPayloadBytes: 1024,
    });

    const result = await service.ingest(
      'data/dev/SN-E',
      new TextEncoder().encode(JSON.stringify({ reported: { current: 5 } })),
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(service.latest('equipment-1')?.reported).toEqual({
      current: 5,
    });
  });

  it('maps emulator identity to a local BDFB and keeps partial metrics in Latest State', async () => {
    const repository = new MemoryTopologyRepository([bdfbDevice('device-1')]);
    const service = new TelemetryService(
      repository,
      new TelemetryHub(4),
      {
        topicPrefix: 'data/dev/',
        maxPayloadBytes: 4096,
      },
      {
        sourceDeviceMap: { 'EMU-BFDB-01': 'device-1' },
        bfdbBindingMode: 'panel-order-24',
        bfdbPositionsPerPanel: 2,
      },
    );

    const full = await service.ingest(
      'data/dev/EMU-BFDB-01',
      new TextEncoder().encode(
        JSON.stringify({
          msgid: '10',
          method: 'update',
          sn: 'EMU-BFDB-01',
          timestamp: 1_790_580_000,
          sendtime: 1_790_580_000,
          reported: {
            '0_1_1': {
              state: 'ONLINE',
              U1: '13.82',
              I1: '3.46',
              P1: '47.83',
              EP1: '0.5074',
            },
          },
        }),
      ),
      '2026-09-28T12:00:00.000Z',
    );

    expect(full.ok).toBe(true);
    expect(service.latest('device-1')?.breakerReadings?.[0]?.breakerId).toBe('breaker-1');
    expect(service.latest('device-1')?.breakerReadings?.[0]?.metrics.currentA?.value).toBe(3.46);

    const partial = await service.ingest(
      'data/dev/EMU-BFDB-01',
      new TextEncoder().encode(
        JSON.stringify({
          msgid: '11',
          method: 'update',
          sn: 'EMU-BFDB-01',
          timestamp: 1_790_580_001,
          sendtime: 1_790_580_001,
          reported: {
            '0_1_1': { state: 'ONLINE' },
          },
        }),
      ),
      '2026-09-28T12:00:01.000Z',
    );

    expect(partial.ok).toBe(true);
    const reading = service.latest('device-1')?.breakerReadings?.[0];
    expect(reading?.metrics.voltageV?.value).toBe(13.82);
    expect(reading?.metrics.currentA?.value).toBe(3.46);
    expect(reading?.metrics.powerW?.value).toBe(47.83);
    expect(reading?.metrics.energyKwh?.value).toBe(0.5074);
    expect(reading?.state?.value).toBe('ONLINE');
  });

  it('rejects unknown and ambiguous source identities', async () => {
    const repository = new MemoryTopologyRepository([
      device('device-1', 'DUP'),
      equipment('equipment-1', 'DUP'),
    ]);
    const service = new TelemetryService(repository, new TelemetryHub(4), {
      topicPrefix: 'data/dev/',
      maxPayloadBytes: 1024,
    });

    expect(
      await service.ingest('data/dev/MISSING', new TextEncoder().encode('{}'), timestamp),
    ).toEqual({ ok: false, error: 'UNKNOWN_SOURCE' });

    expect(await service.ingest('data/dev/DUP', new TextEncoder().encode('{}'), timestamp)).toEqual(
      { ok: false, error: 'UNKNOWN_SOURCE' },
    );
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
