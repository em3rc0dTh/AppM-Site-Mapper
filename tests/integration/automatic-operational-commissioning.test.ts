import { describe, expect, it } from 'vitest';

import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTelemetryWatchRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-watch-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const SOURCE = 'AUTO-WATCH-QDF-5';
const T0 = Date.parse('2026-11-10T15:00:00.000Z');
const stamp = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

function payload(offsetMs: number, state = 'ONLINE'): Uint8Array {
  const epoch = Math.floor((T0 + offsetMs) / 1000);
  return new TextEncoder().encode(
    JSON.stringify({
      msgid: String(epoch),
      method: 'update',
      sn: SOURCE,
      timestamp: epoch,
      sendtime: epoch,
      reported: {
        '0_1_1': {
          state,
          U1: state === 'OFFLINE' ? '0' : '12.52',
          I1: state === 'OFFLINE' ? '0' : '1.84',
          P1: state === 'OFFLINE' ? '0' : '23.04',
          EP1: '2.501',
        },
      },
    }),
  );
}

async function createLab() {
  const device: DeviceNode = {
    id: 'qdf-5-device',
    parentId: 'rack',
    name: 'QDF-5',
    kind: 'DEVICE',
    pinned: false,
    serialNumber: SOURCE,
    deviceType: 'BDFB',
    rootEquipmentIds: [],
    lifecycle: 'ACTIVE',
    createdAt: stamp(-60_000),
    updatedAt: stamp(-60_000),
  };

  const topologyRepository = new MemoryTopologyRepository([device]);
  const topology = new TopologyService(topologyRepository);
  const chassis = await topology.create({
    kind: 'EQUIPMENT',
    parentId: device.id,
    name: 'QDF-5 Chassis',
    equipmentType: 'CHASSIS',
    childMode: 'POSITIONAL',
    childCapacity: 1,
  });
  if (!chassis.ok || chassis.value.kind !== 'EQUIPMENT') throw new Error('Expected chassis');

  const panel = await topology.create({
    kind: 'EQUIPMENT',
    parentId: chassis.value.id,
    parentSlotIndex: 0,
    name: 'A3',
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    childCapacity: 1,
  });
  if (!panel.ok || panel.value.kind !== 'EQUIPMENT') throw new Error('Expected A3 panel');

  const breaker = await topology.create({
    kind: 'EQUIPMENT',
    parentId: panel.value.id,
    parentSlotIndex: 0,
    name: 'A3-01',
    equipmentType: 'CIRCUIT_BREAKER',
  });
  if (!breaker.ok || breaker.value.kind !== 'EQUIPMENT') throw new Error('Expected breaker');

  return { topologyRepository, device, panel: panel.value, breaker: breaker.value };
}

describe('automatic operational commissioning end-to-end', () => {
  it('creates telemetry bindings and watches from the first BFDB packet with zero alarm policies', async () => {
    const { topologyRepository, device, breaker } = await createLab();
    const bindings = new MemoryTelemetryBindingRepository();
    const watches = new MemoryTelemetryWatchRepository();
    const alarms = new MemoryAlarmRepository();
    const policies = new MemoryAlarmPolicyRepository();
    const hub = new TelemetryHub(16);
    const evaluator = new TelemetryAlarmEvaluator(
      alarms,
      policies,
      topologyRepository,
      bindings,
      watches,
      {
        mode: 'ACTIVE',
        lossAfterMs: 1_000,
        recoverySamples: 2,
        reportedOfflineSamples: 2,
      },
    );

    const pending: Promise<void>[] = [];
    const unsubscribe = hub.subscribe((sample) => {
      pending.push(evaluator.observe(sample));
    });
    if (!unsubscribe) throw new Error('Expected alarm evaluator subscription');

    const service = new TelemetryService(
      topologyRepository,
      hub,
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      {},
      bindings,
    );

    expect(await bindings.listForSource('MQTT', SOURCE)).toEqual([]);
    expect(await watches.list()).toEqual([]);
    expect(await policies.listEnabled()).toEqual([]);

    const first = await service.ingest('data/dev/' + SOURCE, payload(0), stamp(0));
    expect(first.ok).toBe(true);
    await Promise.all(pending.splice(0));

    const commissioned = await bindings.listForSource('MQTT', SOURCE);
    const sourceBindings = commissioned.filter(
      (item) => !item.sourcePointId && item.metric === 'SOURCE',
    );
    const pointBindings = commissioned.filter((item) => item.sourcePointId === '0_1_1');

    expect(sourceBindings).toHaveLength(1);
    expect(sourceBindings[0]).toMatchObject({
      sourceIdentity: SOURCE,
      targetType: 'DEVICE',
      targetId: device.id,
      attributes: {
        discovery: 'UNIQUE_INVENTORY_SN',
        matchedNodeId: device.id,
      },
    });
    expect(pointBindings.map((item) => item.metric).sort()).toEqual([
      'CURRENT',
      'ENERGY',
      'POWER',
      'VOLTAGE',
    ]);
    expect(
      pointBindings.every(
        (item) =>
          item.targetId === breaker.id &&
          item.attributes?.commissioning === 'AUTO_RECONCILED' &&
          item.attributes?.discovery === 'TOPOLOGY_POINT_MATCH',
      ),
    ).toBe(true);

    const watchState = await watches.list();
    expect(watchState).toHaveLength(2);
    expect(watchState).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'SOURCE',
          sourceIdentity: SOURCE,
          targetId: device.id,
          lastObservedAt: stamp(0),
        }),
        expect.objectContaining({
          scope: 'POINT',
          sourceIdentity: SOURCE,
          sourcePointId: '0_1_1',
          targetId: breaker.id,
          lastObservedAt: stamp(0),
          lastUsableAt: stamp(0),
        }),
      ]),
    );

    expect(await policies.listEnabled()).toEqual([]);
    expect(await alarms.listActive()).toEqual([]);

    await evaluator.evaluateNow(T0 + 1_500);

    const [loss] = await alarms.listActive();
    expect(loss).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetType: 'DEVICE',
      targetId: device.id,
      sourceContext: 'auto-watch:mqtt:' + SOURCE + ':source',
    });
    expect(await alarms.listActive()).toHaveLength(1);

    for (const offset of [1_600, 1_700]) {
      const recovered = await service.ingest(
        'data/dev/' + SOURCE,
        payload(offset),
        stamp(offset),
      );
      expect(recovered.ok).toBe(true);
      await Promise.all(pending.splice(0));
    }
    await evaluator.evaluateNow(T0 + 1_701);

    expect(await alarms.listActive()).toEqual([]);
    expect((await alarms.listResolved())[0]).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: device.id,
      lifecycle: 'RESOLVED',
    });

    unsubscribe();
  });
});
