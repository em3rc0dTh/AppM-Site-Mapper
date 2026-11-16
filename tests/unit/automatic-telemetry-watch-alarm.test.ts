import { describe, expect, it } from 'vitest';

import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTelemetryWatchRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-watch-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const T0 = Date.parse('2026-11-10T15:00:00.000Z');
const createdAt = new Date(T0 - 60_000).toISOString();

function topology(): readonly TopologyNode[] {
  return [
    {
      id: 'rack',
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      parentId: 'position',
      name: 'QDF-5 Rack',
      cas: [],
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'device',
      kind: 'DEVICE',
      deviceType: 'BDFB',
      parentId: 'rack',
      name: 'BDFB QDF-5',
      serialNumber: '26092403950002',
      pinned: false,
      rootEquipmentIds: [],
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'panel',
      kind: 'EQUIPMENT',
      equipmentType: 'PANEL',
      parentId: 'device',
      parentEquipmentId: null,
      deviceId: 'device',
      name: 'A3',
      childMode: 'POSITIONAL',
      children: ['breaker-1', 'breaker-2'],
      accessPorts: [],
      pinned: false,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'breaker-1',
      kind: 'EQUIPMENT',
      equipmentType: 'CIRCUIT_BREAKER',
      parentId: 'panel',
      parentEquipmentId: 'panel',
      deviceId: 'device',
      name: 'A3-01',
      childMode: 'DYNAMIC',
      children: [],
      accessPorts: [],
      pinned: false,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'breaker-2',
      kind: 'EQUIPMENT',
      equipmentType: 'CIRCUIT_BREAKER',
      parentId: 'panel',
      parentEquipmentId: 'panel',
      deviceId: 'device',
      name: 'A3-02',
      childMode: 'DYNAMIC',
      children: [],
      accessPorts: [],
      pinned: false,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
  ] as unknown as readonly TopologyNode[];
}

function bindings(): readonly TelemetryBinding[] {
  return [
    {
      id: 'source',
      protocol: 'MQTT',
      sourceIdentity: '26092403950002',
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId: 'device',
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'point-1',
      protocol: 'MQTT',
      sourceIdentity: '26092403950002',
      sourcePointId: '0_1_1:1',
      metric: 'VOLTAGE',
      targetType: 'EQUIPMENT',
      targetId: 'breaker-1',
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'point-2',
      protocol: 'MQTT',
      sourceIdentity: '26092403950002',
      sourcePointId: '0_1_1:2',
      metric: 'VOLTAGE',
      targetType: 'EQUIPMENT',
      targetId: 'breaker-2',
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function sourceSample(at: number): TelemetrySample {
  const receivedAt = new Date(at).toISOString();
  return {
    bindingId: 'source',
    targetId: 'device',
    targetType: 'DEVICE',
    entityId: 'device',
    entityKind: 'DEVICE',
    sourceIdentity: '26092403950002',
    reported: {},
    receivedAt,
    protocol: 'BFDB',
  };
}

function pointSample(
  breakerId: 'breaker-1' | 'breaker-2',
  point: '0_1_1:1' | '0_1_1:2',
  at: number,
  state = 'ONLINE',
): TelemetrySample {
  const receivedAt = new Date(at).toISOString();
  return {
    bindingId: breakerId === 'breaker-1' ? 'point-1' : 'point-2',
    metricBindingIds: [breakerId === 'breaker-1' ? 'point-1' : 'point-2'],
    sourcePointId: point,
    targetId: breakerId,
    targetType: 'EQUIPMENT',
    entityId: breakerId,
    entityKind: 'EQUIPMENT',
    sourceIdentity: '26092403950002',
    reported: {
      voltageV: { value: state === 'OFFLINE' ? 0 : 12.5, unit: 'V', observedAt: receivedAt },
      state,
    },
    receivedAt,
    protocol: 'BFDB',
  };
}

function setup() {
  const topologyRepository = new MemoryTopologyRepository(topology());
  const alarmRepository = new MemoryAlarmRepository();
  const policyRepository = new MemoryAlarmPolicyRepository();
  const bindingRepository = new MemoryTelemetryBindingRepository(bindings());
  const watchRepository = new MemoryTelemetryWatchRepository();
  const evaluator = new TelemetryAlarmEvaluator(
    alarmRepository,
    policyRepository,
    topologyRepository,
    bindingRepository,
    watchRepository,
    {
      lossAfterMs: 1_000,
      recoverySamples: 2,
      reportedOfflineSamples: 2,
    },
  );
  return { evaluator, alarmRepository };
}

describe('automatic operational telemetry alarms', () => {
  it('keeps shadow rollout non-persistent and de-duplicated', async () => {
    const topologyRepository = new MemoryTopologyRepository(topology());
    const alarmRepository = new MemoryAlarmRepository();
    const bindingRepository = new MemoryTelemetryBindingRepository(bindings());
    const watchRepository = new MemoryTelemetryWatchRepository();
    const signals: Array<{ action: string; targetId: string }> = [];
    const evaluator = new TelemetryAlarmEvaluator(
      alarmRepository,
      new MemoryAlarmPolicyRepository(),
      topologyRepository,
      bindingRepository,
      watchRepository,
      {
        mode: 'SHADOW',
        lossAfterMs: 1_000,
        recoverySamples: 2,
        reportedOfflineSamples: 2,
        onShadowSignal: (signal) => signals.push(signal),
      },
    );

    await evaluator.observe(sourceSample(T0));
    await evaluator.evaluateNow(T0 + 1_500);
    await evaluator.evaluateNow(T0 + 1_600);

    expect(await alarmRepository.listActive()).toHaveLength(0);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ action: 'ASSERT', targetId: 'device' });

    await evaluator.observe(sourceSample(T0 + 1_700));
    await evaluator.observe(sourceSample(T0 + 1_800));
    await evaluator.evaluateNow(T0 + 1_801);
    expect(signals.at(-1)).toMatchObject({ action: 'RESOLVE', targetId: 'device' });
  });

  it('raises one source alarm and suppresses descendants', async () => {
    const { evaluator, alarmRepository } = setup();
    await evaluator.observe(sourceSample(T0));
    await evaluator.observe(pointSample('breaker-1', '0_1_1:1', T0));
    await evaluator.observe(pointSample('breaker-2', '0_1_1:2', T0));

    await evaluator.evaluateNow(T0 + 1_500);

    const active = await alarmRepository.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: 'device',
      sourceContext: 'auto-watch:mqtt:26092403950002:source',
    });
  });

  it('raises a breaker alarm when one point disappears', async () => {
    const { evaluator, alarmRepository } = setup();
    await evaluator.observe(sourceSample(T0));
    await evaluator.observe(pointSample('breaker-1', '0_1_1:1', T0));
    await evaluator.observe(pointSample('breaker-2', '0_1_1:2', T0));

    await evaluator.observe(sourceSample(T0 + 1_400));
    await evaluator.observe(pointSample('breaker-1', '0_1_1:1', T0 + 1_400));
    await evaluator.evaluateNow(T0 + 1_500);

    const active = await alarmRepository.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: 'breaker-2',
    });
    expect(active[0]?.sourceContext).toContain(':point:0_1_1:2:breaker-2');
  });

  it('raises one panel alarm when all panel points are offline', async () => {
    const { evaluator, alarmRepository } = setup();
    await evaluator.observe(sourceSample(T0));
    await evaluator.observe(pointSample('breaker-1', '0_1_1:1', T0));
    await evaluator.observe(pointSample('breaker-2', '0_1_1:2', T0));

    await evaluator.observe(sourceSample(T0 + 500));
    await evaluator.observe(pointSample('breaker-1', '0_1_1:1', T0 + 500, 'OFFLINE'));
    await evaluator.observe(pointSample('breaker-2', '0_1_1:2', T0 + 500, 'OFFLINE'));
    await evaluator.observe(pointSample('breaker-1', '0_1_1:1', T0 + 600, 'OFFLINE'));
    await evaluator.observe(pointSample('breaker-2', '0_1_1:2', T0 + 600, 'OFFLINE'));
    await evaluator.evaluateNow(T0 + 700);

    const active = await alarmRepository.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: 'panel',
      sourceContext: 'auto-watch:mqtt:26092403950002:panel:panel',
    });
  });

  it('reconstructs a lost source after evaluator restart from persisted watch state', async () => {
    const topologyRepository = new MemoryTopologyRepository(topology());
    const alarmRepository = new MemoryAlarmRepository();
    const policyRepository = new MemoryAlarmPolicyRepository();
    const bindingRepository = new MemoryTelemetryBindingRepository(bindings());
    const watchRepository = new MemoryTelemetryWatchRepository();

    const first = new TelemetryAlarmEvaluator(
      alarmRepository,
      policyRepository,
      topologyRepository,
      bindingRepository,
      watchRepository,
      { lossAfterMs: 1_000, recoverySamples: 2, reportedOfflineSamples: 2 },
    );
    await first.observe(sourceSample(T0));

    const restarted = new TelemetryAlarmEvaluator(
      alarmRepository,
      policyRepository,
      topologyRepository,
      bindingRepository,
      watchRepository,
      { lossAfterMs: 1_000, recoverySamples: 2, reportedOfflineSamples: 2 },
    );
    await restarted.evaluateNow(T0 + 1_500);

    expect(await alarmRepository.listActive()).toHaveLength(1);
    expect((await alarmRepository.listActive())[0]).toMatchObject({
      targetId: 'device',
      alarmCode: 'TELEMETRY_LOSS',
    });
  });

  it('escalates simultaneous source loss without a global target', async () => {
    const secondDevice = {
      id: 'device-2',
      kind: 'DEVICE',
      deviceType: 'BDFB',
      parentId: 'rack',
      name: 'BDFB QDF-4',
      serialNumber: '26092403950004',
      pinned: false,
      rootEquipmentIds: [],
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    } as unknown as TopologyNode;
    const source2: TelemetryBinding = {
      id: 'source-2',
      protocol: 'MQTT',
      sourceIdentity: '26092403950004',
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId: 'device-2',
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    };

    const topologyRepository = new MemoryTopologyRepository([...topology(), secondDevice]);
    const alarmRepository = new MemoryAlarmRepository();
    const bindingRepository = new MemoryTelemetryBindingRepository([...bindings(), source2]);
    const watchRepository = new MemoryTelemetryWatchRepository();
    const evaluator = new TelemetryAlarmEvaluator(
      alarmRepository,
      new MemoryAlarmPolicyRepository(),
      topologyRepository,
      bindingRepository,
      watchRepository,
      { lossAfterMs: 1_000, recoverySamples: 2, reportedOfflineSamples: 2 },
    );

    await evaluator.observe(sourceSample(T0));
    await evaluator.observe({
      ...sourceSample(T0),
      bindingId: 'source-2',
      targetId: 'device-2',
      entityId: 'device-2',
      sourceIdentity: '26092403950004',
    });
    await evaluator.evaluateNow(T0 + 1_500);

    const active = await alarmRepository.listActive();
    expect(active).toHaveLength(2);
    expect(active.every((item) => item.severity === 'CRITICAL')).toBe(true);
    expect(active.every((item) => item.alarmCode === 'TELEMETRY_LOSS')).toBe(true);
  });

  it('resolves a source loss only after the configured recovery sample count', async () => {
    const { evaluator, alarmRepository } = setup();
    await evaluator.observe(sourceSample(T0));
    await evaluator.evaluateNow(T0 + 1_500);
    expect(await alarmRepository.listActive()).toHaveLength(1);

    await evaluator.observe(sourceSample(T0 + 1_600));
    await evaluator.evaluateNow(T0 + 1_601);
    expect(await alarmRepository.listActive()).toHaveLength(1);

    await evaluator.observe(sourceSample(T0 + 1_700));
    await evaluator.evaluateNow(T0 + 1_701);
    expect(await alarmRepository.listActive()).toHaveLength(0);
    expect((await alarmRepository.listResolved())[0]).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: 'device',
      lifecycle: 'RESOLVED',
    });
  });
});
