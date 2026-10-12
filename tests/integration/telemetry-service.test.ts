import { describe, expect, it } from 'vitest';

import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { TopologyService } from '@/modules/topology/application/topology-service';
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

async function createBdfbBreakers(
  repository: MemoryTopologyRepository,
  owner: DeviceNode,
  count: number,
): Promise<readonly EquipmentNode[]> {
  const topology = new TopologyService(repository);
  const chassis = await topology.create({
    kind: 'EQUIPMENT',
    parentId: owner.id,
    name: owner.name + ' Chassis',
    equipmentType: 'CHASSIS',
    childMode: 'POSITIONAL',
    childCapacity: 1,
  });
  if (!chassis.ok || chassis.value.kind !== 'EQUIPMENT') throw new Error('Expected chassis');

  const panel = await topology.create({
    kind: 'EQUIPMENT',
    parentId: chassis.value.id,
    parentSlotIndex: 0,
    name: 'A1',
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    childCapacity: count,
  });
  if (!panel.ok || panel.value.kind !== 'EQUIPMENT') throw new Error('Expected panel');

  const breakers: EquipmentNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const created = await topology.create({
      kind: 'EQUIPMENT',
      parentId: panel.value.id,
      parentSlotIndex: index,
      name: 'A1-' + String(index + 1).padStart(2, '0'),
      equipmentType: 'CIRCUIT_BREAKER',
    });
    if (!created.ok || created.value.kind !== 'EQUIPMENT') throw new Error('Expected breaker');
    breakers.push(created.value);
  }
  return breakers;
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
    const breakers = await createBdfbBreakers(repository, bdfb, 2);
    const breaker = breakers[0]!;
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
              breaker.id,
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
    expect(service.latest(breaker.id)?.sourcePointId).toBe('0_1_1');
    expect(service.latest(breaker.id)?.reported.currentA).toMatchObject({ value: 3.46, unit: 'A' });
    expect(service.latest(breakers[1]!.id)).toBeNull();
    expect(service.latest(bdfb.id)?.breakerReadings?.[0]?.breakerId).toBe(breaker.id);
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

  it('rejects a stale SOURCE binding instead of guessing physical telemetry mappings', async () => {
    const bdfb: DeviceNode = {
      ...device('device-stale-source', 'EMU-BFDB-STALE'),
      deviceType: 'BDFB',
    };
    const repository = new MemoryTopologyRepository([bdfb]);
    await createBdfbBreakers(repository, bdfb, 1);

    const service = new TelemetryService(
      repository,
      new TelemetryHub(4),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {
        configuredBindings: [binding('stale-source', 'EMU-BFDB-STALE', 'DEVICE', 'missing-device')],
      },
    );

    const result = await service.ingest(
      'data/dev/EMU-BFDB-STALE',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'EMU-BFDB-STALE',
          timestamp: 1_790_580_000,
          sendtime: 1_790_580_000,
          reported: { '0_1_1': { state: 'ONLINE', U1: '13.8' } },
        }),
      ),
      timestamp,
    );

    expect(result).toEqual({ ok: false, error: 'INVALID_BINDING_TARGET' });
  });

  it('automatically discovers an existing BDFB Device SN and persists the SOURCE binding', async () => {
    const bdfb: DeviceNode = {
      ...device('device-canonical', 'EMU-BFDB-CANONICAL'),
      deviceType: 'BDFB',
    };
    const repository = new MemoryTopologyRepository([bdfb]);
    await createBdfbBreakers(repository, bdfb, 1);

    const bindings = new MemoryTelemetryBindingRepository();
    const service = new TelemetryService(
      repository,
      new TelemetryHub(4),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {},
      bindings,
    );

    const result = await service.ingest(
      'data/dev/EMU-BFDB-CANONICAL',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'EMU-BFDB-CANONICAL',
          timestamp: 1_790_580_000,
          sendtime: 1_790_580_000,
          reported: { '0_1_1': { state: 'ONLINE', U1: '13.8' } },
        }),
      ),
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.targetId : null).toBe(bdfb.id);
    expect(result.ok ? (result.value.breakerReadings?.length ?? 0) : -1).toBe(0);
    const stored = await bindings.listForSource('MQTT', 'EMU-BFDB-CANONICAL');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      sourceIdentity: 'EMU-BFDB-CANONICAL',
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId: bdfb.id,
    });
    // Repeated messages do not insert duplicate SOURCE bindings.
    const again = await service.ingest(
      'data/dev/EMU-BFDB-CANONICAL',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'EMU-BFDB-CANONICAL',
          timestamp: 1790580001,
          reported: {},
        }),
      ),
    );
    expect(again.ok).toBe(true);
    expect(await bindings.listForSource('MQTT', 'EMU-BFDB-CANONICAL')).toHaveLength(1);
  });

  it('infers the source Device from explicit point bindings when SOURCE is absent', async () => {
    const bdfb: DeviceNode = {
      ...device('device-inferred', 'LOCAL-BFDB-INFERRED'),
      deviceType: 'BDFB',
    };
    const repository = new MemoryTopologyRepository([bdfb]);
    const breaker = (await createBdfbBreakers(repository, bdfb, 1))[0]!;
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
            breaker.id,
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
          method: 'update',
          sn: 'EMU-BFDB-INFERRED',
          timestamp: 1_790_580_000,
          sendtime: 1_790_580_000,
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

  it('binds a BDFB root Chassis SN to the Chassis itself', async () => {
    const owner = {
      ...device('bdfb-chassis-owner', 'DEVICE-OTHER-SN'),
      deviceType: 'BDFB' as const,
    };
    const chassis = { ...equipment('bdfb-root-chassis', owner), serialNumber: 'EMU-BFDB-03' };
    const withRoot = { ...owner, rootEquipmentIds: [chassis.id] };
    const repo = new MemoryTopologyRepository([withRoot, chassis]);
    const bindings = new MemoryTelemetryBindingRepository();
    const service = new TelemetryService(
      repo,
      new TelemetryHub(5),
      {
        topicPrefix: 'data/dev/',
        maxPayloadBytes: 4096,
      },
      {},
      bindings,
    );
    const payload = new TextEncoder().encode(
      JSON.stringify({
        method: 'update',
        sn: 'EMU-BFDB-03',
        timestamp: 1790580000,
        reported: { '0_1_1': { U1: 12.3 } },
      }),
    );
    const result = await service.ingest('data/dev/EMU-BFDB-03', payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetId).toBe(chassis.id);
      expect(result.value.breakerReadings ?? []).toHaveLength(0);
      expect(result.value.unmappedPointIds).toEqual(['0_1_1']);
    }
    const stored = await bindings.listForSource('MQTT', 'EMU-BFDB-03');
    expect(stored[0]?.attributes?.matchedNodeId).toBe(chassis.id);
  });

  it('refuses duplicate SNs, even if both equipment belong to the same Device', async () => {
    const owner = { ...device('duplicate-owner', 'SOME-OTHER-SN'), deviceType: 'BDFB' as const };
    const root = { ...equipment('root-one', owner), serialNumber: 'EMU-DUP' };
    const nested = { ...equipment('root-two', owner), serialNumber: 'EMU-DUP' };
    const repo = new MemoryTopologyRepository([
      { ...owner, rootEquipmentIds: [root.id] },
      root,
      nested,
    ]);
    const bindings = new MemoryTelemetryBindingRepository();
    const service = new TelemetryService(
      repo,
      new TelemetryHub(3),
      {
        topicPrefix: 'data/dev/',
        maxPayloadBytes: 4096,
      },
      {},
      bindings,
    );
    const result = await service.ingest(
      'data/dev/EMU-DUP',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'EMU-DUP',
          timestamp: 1790580000,
          reported: {},
        }),
      ),
    );
    expect(result).toEqual({ ok: false, error: 'AMBIGUOUS_SOURCE_BINDING' });
    expect(await bindings.listForSource('MQTT', 'EMU-DUP')).toHaveLength(0);
  });

  it('rejects an orphan breaker SN without a validated inventory chain', async () => {
    const owner = { ...device('breaker-owner', 'DEVICE-NO-MATCH'), deviceType: 'BDFB' as const };
    const breaker = {
      ...equipment('breaker-in-bdfb', owner),
      equipmentType: 'CIRCUIT_BREAKER' as const,
      serialNumber: 'BREAKER-SN',
    };
    const repo = new MemoryTopologyRepository([owner, breaker]);
    const bindings = new MemoryTelemetryBindingRepository();
    const service = new TelemetryService(
      repo,
      new TelemetryHub(3),
      {
        topicPrefix: 'data/dev/',
        maxPayloadBytes: 4096,
      },
      {},
      bindings,
    );
    const result = await service.ingest(
      'data/dev/BREAKER-SN',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'BREAKER-SN',
          timestamp: 1790580000,
          reported: {},
        }),
      ),
    );
    expect(result).toEqual({ ok: false, error: 'INVALID_BINDING_TARGET' });
    expect(await bindings.listForSource('MQTT', 'BREAKER-SN')).toHaveLength(0);
  });

  it('recovers from a stale environment map when inventory uniquely identifies the BDFB', async () => {
    const owner = {
      ...device('correct-owner', 'EMU-BFDB-STALENVMAP'),
      deviceType: 'BDFB' as const,
    };
    const bindings = new MemoryTelemetryBindingRepository();
    const repo = new MemoryTopologyRepository([owner]);
    const service = new TelemetryService(
      repo,
      new TelemetryHub(5),
      {
        topicPrefix: 'data/dev/',
        maxPayloadBytes: 4096,
      },
      {
        configuredBindings: [
          binding('env:mqtt:EMU-BFDB-STALENVMAP', 'EMU-BFDB-STALENVMAP', 'DEVICE', 'old-db-id'),
        ],
      },
      bindings,
    );
    const result = await service.ingest(
      'data/dev/EMU-BFDB-STALENVMAP',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'EMU-BFDB-STALENVMAP',
          timestamp: 1790580000,
          reported: {},
        }),
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.targetId : null).toBe(owner.id);
    expect((await bindings.listForSource('MQTT', 'EMU-BFDB-STALENVMAP'))[0]?.targetId).toBe(
      owner.id,
    );
  });

  it('rejects a legacy map to a different valid BFDB when this SN belongs to another Device', async () => {
    const actual = { ...device('actual-publisher', 'EMU-REAL-02'), deviceType: 'BDFB' as const };
    const wrong = { ...device('wrong-legacy-target', 'OTHER-SN'), deviceType: 'BDFB' as const };
    const service = new TelemetryService(
      new MemoryTopologyRepository([actual, wrong]),
      new TelemetryHub(5),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      { configuredBindings: [binding('env:mqtt:EMU-REAL-02', 'EMU-REAL-02', 'DEVICE', wrong.id)] },
      new MemoryTelemetryBindingRepository(),
    );
    const result = await service.ingest(
      'data/dev/EMU-REAL-02',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'EMU-REAL-02',
          timestamp: 1790580000,
          reported: {},
        }),
      ),
    );
    expect(result).toEqual({ ok: false, error: 'AMBIGUOUS_SOURCE_BINDING' });
  });

  it('fails closed for a stale persisted SOURCE mapping, never silently retargeting it', async () => {
    const owner = {
      ...device('not-old-owner', 'EMU-STALE-PERSISTED'),
      deviceType: 'BDFB' as const,
    };
    const bindings = new MemoryTelemetryBindingRepository([
      binding('manual-source', 'EMU-STALE-PERSISTED', 'DEVICE', 'missing-id'),
    ]);
    const service = new TelemetryService(
      new MemoryTopologyRepository([owner]),
      new TelemetryHub(5),
      {
        topicPrefix: 'data/dev/',
        maxPayloadBytes: 4096,
      },
      {},
      bindings,
    );
    expect(
      await service.ingest(
        'data/dev/EMU-STALE-PERSISTED',
        new TextEncoder().encode(
          JSON.stringify({
            method: 'update',
            sn: 'EMU-STALE-PERSISTED',
            timestamp: 1790580000,
            reported: {},
          }),
        ),
      ),
    ).toEqual({ ok: false, error: 'INVALID_BINDING_TARGET' });
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

describe('independent Equipment identity', () => {
  it('discovers a nested non-BDFB Equipment and isolates it from its parent and sibling', async () => {
    const owner = device('switch', 'SWITCH-SN');
    const root = {
      ...equipment('root', owner),
      serialNumber: 'ROOT-SN',
      children: ['child', 'sibling'],
    };
    const child = {
      ...equipment('child', owner),
      serialNumber: 'CHILD-SN',
      parentId: root.id,
      parentEquipmentId: root.id,
    };
    const sibling = { ...child, id: 'sibling', serialNumber: 'SIBLING-SN' };
    const repo = new MemoryTopologyRepository([
      { ...owner, rootEquipmentIds: [root.id] },
      root,
      child,
      sibling,
    ]);
    const bindings = new MemoryTelemetryBindingRepository();
    const hub = new TelemetryHub(3);
    const written: string[] = [];
    const service = new TelemetryService(
      repo,
      hub,
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {},
      bindings,
      {
        write: async (sample) => {
          written.push(sample.targetId);
        },
      },
    );
    const payload = new TextEncoder().encode(
      JSON.stringify({ reported: { temperature: { value: 33, unit: 'C' } } }),
    );
    const result = await service.ingest('data/dev/CHILD-SN', payload);
    expect(result.ok && result.value.targetId).toBe(child.id);
    expect((await bindings.listForSource('MQTT', 'CHILD-SN'))[0]?.targetType).toBe('EQUIPMENT');
    expect(hub.latest(root.id)).toBeNull();
    expect(hub.latest(sibling.id)).toBeNull();
    expect(written).toEqual([child.id]);
    await repo.replace({ ...root, lifecycle: 'ARCHIVED' });
    expect((await service.ingest('data/dev/CHILD-SN', payload)).ok).toBe(false);
  });

  it('migrates only the proven old automatic root-Chassis SOURCE binding', async () => {
    const owner = {
      ...device('bdfb', 'DEVICE-SN'),
      deviceType: 'BDFB' as const,
      rootEquipmentIds: ['root'],
    };
    const root = { ...equipment('root', owner), serialNumber: 'ROOT-SN' };
    const repo = new MemoryTopologyRepository([owner, root]);
    const old = {
      ...binding('auto:old', 'ROOT-SN', 'DEVICE', owner.id),
      attributes: { discovery: 'UNIQUE_INVENTORY_SN', matchedNodeId: root.id },
    };
    const bindings = new MemoryTelemetryBindingRepository([old]);
    const service = new TelemetryService(
      repo,
      new TelemetryHub(3),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {},
      bindings,
    );
    const result = await service.ingest(
      'data/dev/ROOT-SN',
      new TextEncoder().encode('{"reported":{"temperature":32}}'),
    );
    expect(result.ok && result.value.targetId).toBe(root.id);
    const stored = (await bindings.listForSource('MQTT', 'ROOT-SN'))[0];
    expect(stored?.targetType).toBe('EQUIPMENT');
    expect(stored?.attributes?.previousTargetId).toBe(owner.id);
  });
});
