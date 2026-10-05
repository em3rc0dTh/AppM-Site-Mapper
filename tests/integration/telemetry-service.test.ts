import { describe, expect, it } from 'vitest';

import { BdfbService } from '@/modules/power/application/bdfb-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-09-22T00:00:00.000Z';

function binding(
  id: string,
  sourceIdentity: string,
  targetType: TelemetryBinding['targetType'],
  targetId: string,
  sourcePointId?: string,
  metric = 'SOURCE',
): TelemetryBinding {
  return {
    id,
    protocol: 'MQTT',
    sourceIdentity,
    ...(sourcePointId ? { sourcePointId } : {}),
    metric,
    targetType,
    targetId,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function device(id: string, serialNumber: string): DeviceNode {
  return {
    id,
    parentId: 'rack',
    name: id,
    kind: 'DEVICE',
    pinned: false,
    serialNumber,
    deviceType: 'CUSTOM',
    rootEquipmentIds: [],
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function equipment(id: string, owner: DeviceNode): EquipmentNode {
  return {
    id,
    parentId: owner.id,
    deviceId: owner.id,
    name: id,
    kind: 'EQUIPMENT',
    equipmentType: 'CHASSIS',
    parentEquipmentId: null,
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('TelemetryService', () => {
  it('maps generic telemetry only through an explicit source binding', async () => {
    const owner = device('device-1', 'SN-D');
    const physical = equipment('equipment-1', owner);
    const repository = new MemoryTopologyRepository([owner, physical]);
    const hub = new TelemetryHub(4);
    const service = new TelemetryService(
      repository,
      hub,
      { topicPrefix: 'data/dev/', maxPayloadBytes: 1024 },
      {
        configuredBindings: [binding('source-equipment', 'SN-E', 'EQUIPMENT', physical.id)],
      },
    );

    const result = await service.ingest(
      'data/dev/SN-E',
      new TextEncoder().encode(JSON.stringify({ reported: { current: 5 } })),
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(service.latest(physical.id)?.reported).toEqual({ current: 5 });
  });

  it('maps BFDB point telemetry through explicit Device and Equipment bindings', async () => {
    const bdfb: DeviceNode = {
      ...device('device-1', 'LOCAL-BFDB-01'),
      deviceType: 'BDFB',
    };
    const repository = new MemoryTopologyRepository([bdfb]);
    const configured = await new BdfbService(repository).configure(bdfb.id, {
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
                  positions: [
                    { id: 'breaker-1', label: 'CB-01' },
                    { id: 'breaker-2', label: 'CB-02' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(configured.ok).toBe(true);

    const service = new TelemetryService(
      repository,
      new TelemetryHub(4),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {
        configuredBindings: [
          binding('source-bdfb', 'EMU-BFDB-01', 'DEVICE', bdfb.id),
          ...(['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const).map((metric) =>
            binding(
              `point-bdfb-1-${metric.toLowerCase()}`,
              'EMU-BFDB-01',
              'EQUIPMENT',
              'device-1:equipment:breaker-1',
              '0_1_1',
              metric,
            ),
          ),
        ],
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
    expect(service.latest(bdfb.id)?.breakerReadings?.[0]?.breakerId).toBe(
      'device-1:equipment:breaker-1',
    );
    expect(service.latest(bdfb.id)?.breakerReadings?.[0]?.metrics.currentA?.value).toBe(3.46);

    const partial = await service.ingest(
      'data/dev/EMU-BFDB-01',
      new TextEncoder().encode(
        JSON.stringify({
          msgid: '11',
          method: 'update',
          sn: 'EMU-BFDB-01',
          timestamp: 1_790_580_001,
          sendtime: 1_790_580_001,
          reported: { '0_1_1': { state: 'ONLINE' } },
        }),
      ),
      '2026-09-28T12:00:01.000Z',
    );

    expect(partial.ok).toBe(true);
    const reading = service.latest(bdfb.id)?.breakerReadings?.[0];
    expect(reading?.metrics.voltageV?.value).toBe(13.82);
    expect(reading?.metrics.currentA?.value).toBe(3.46);
    expect(reading?.metrics.powerW?.value).toBe(47.83);
    expect(reading?.metrics.energyKwh?.value).toBe(0.5074);
    expect(reading?.state?.value).toBe('ONLINE');
  });

  it('infers the source Device from explicit point bindings when SOURCE is absent', async () => {
    const bdfb: DeviceNode = {
      ...device('device-inferred', 'LOCAL-BFDB-INFERRED'),
      deviceType: 'BDFB',
    };
    const repository = new MemoryTopologyRepository([bdfb]);
    const configured = await new BdfbService(repository).configure(bdfb.id, {
      panels: [
        {
          id: 'panel-a1',
          label: 'A1',
          positions: [{ id: 'breaker-1', label: 'CB-01' }],
        },
      ],
    });
    expect(configured.ok).toBe(true);

    const service = new TelemetryService(
      repository,
      new TelemetryHub(4),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {
        configuredBindings: (['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const).map((metric) =>
          binding(
            `point-inferred-${metric.toLowerCase()}`,
            'EMU-BFDB-INFERRED',
            'EQUIPMENT',
            'device-inferred:equipment:breaker-1',
            '0_1_1',
            metric,
          ),
        ),
      },
    );

    const result = await service.ingest(
      'data/dev/EMU-BFDB-INFERRED',
      new TextEncoder().encode(
        JSON.stringify({
          sn: 'EMU-BFDB-INFERRED',
          reported: {
            '0_1_1': { state: 'ONLINE', U1: '13.8', I1: '2', P1: '27.6', EP1: '0.1' },
          },
        }),
      ),
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.targetId : null).toBe(bdfb.id);
    expect(result.ok ? result.value.breakerReadings?.[0]?.rawPointId : null).toBe('0_1_1');
  });

  it('rejects unknown source identities', async () => {
    const repository = new MemoryTopologyRepository([device('device-1', 'DUP')]);
    const service = new TelemetryService(repository, new TelemetryHub(4), {
      topicPrefix: 'data/dev/',
      maxPayloadBytes: 1024,
    });

    expect(
      await service.ingest('data/dev/MISSING', new TextEncoder().encode('{}'), timestamp),
    ).toEqual({ ok: false, error: 'UNKNOWN_SOURCE' });
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
