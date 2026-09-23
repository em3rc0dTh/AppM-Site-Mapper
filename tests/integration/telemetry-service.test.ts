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
  it('maps telemetry to sibling Device and Equipment by external serial identity', async () => {
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
    expect(service.latest('equipment-1')?.reported).toEqual({ current: 5 });
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

    expect(
      await service.ingest('data/dev/DUP', new TextEncoder().encode('{}'), timestamp),
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
