import { describe, expect, it } from 'vitest';

import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const createdAt = '2026-10-30T02:00:00.000Z';

function breakerTopology(): readonly TopologyNode[] {
  return [
    {
      id: 'rack',
      name: 'QDF4',
      kind: 'CONTAINER_RACK',
      parentId: null,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'device',
      name: 'BDFB QDF-4',
      kind: 'DEVICE',
      parentId: 'rack',
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'breaker',
      name: 'A3-04',
      kind: 'EQUIPMENT',
      parentId: 'device',
      parentEquipmentId: null,
      deviceId: 'device',
      equipmentType: 'CIRCUIT_BREAKER',
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

function sample(voltageV: number, currentA: number, receivedAt: string): TelemetrySample {
  return {
    bindingId: 'binding',
    metricBindingIds: ['voltage', 'current'],
    sourcePointId: '0_1_4',
    targetId: 'breaker',
    targetType: 'EQUIPMENT',
    entityId: 'breaker',
    entityKind: 'EQUIPMENT',
    sourceIdentity: 'EMU-TELXIUS-QDF-4',
    receivedAt,
    reported: {
      voltageV: { value: voltageV, unit: 'V', observedAt: receivedAt },
      currentA: { value: currentA, unit: 'A', observedAt: receivedAt },
    },
  };
}

describe('TelemetryAlarmEvaluator', () => {
  it('uses commissioned debounce/recovery and never treats ACK as recovery', async () => {
    const topology = new MemoryTopologyRepository(breakerTopology());
    const alarms = new MemoryAlarmRepository();
    const policy: AlarmPolicy = {
      id: 'policy-a3-04',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'mqtt:0_1_4',
      sourceIdentity: 'EMU-TELXIUS-QDF-4',
      enabled: true,
      lowVoltage: {
        assertBelowV: 45,
        clearAboveV: 47,
        debounceSamples: 2,
        recoverySamples: 2,
        severity: 'WARNING',
      },
      createdAt,
      updatedAt: createdAt,
    };
    const policies = new MemoryAlarmPolicyRepository([policy]);
    const evaluator = new TelemetryAlarmEvaluator(alarms, policies, topology);
    const query = new AlarmService(alarms, topology);

    await evaluator.observe(sample(44, 4, '2026-10-30T02:10:00.000Z'));
    expect(await alarms.listActive()).toHaveLength(0);

    await evaluator.observe(sample(44, 4, '2026-10-30T02:10:10.000Z'));
    const active = await alarms.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.alarmCode).toBe('LOW_VOLTAGE');

    await query.acknowledge(active[0]!.id, 'operator');
    expect((await alarms.listActive())[0]?.lifecycle).toBe('ACTIVE');

    await evaluator.observe(sample(48, 4, '2026-10-30T02:10:20.000Z'));
    expect(await alarms.listActive()).toHaveLength(1);
    await evaluator.observe(sample(48, 4, '2026-10-30T02:10:30.000Z'));
    expect(await alarms.listActive()).toHaveLength(0);
  });

  it('does not convert OFFLINE zeroes into electrical loss', async () => {
    const topology = new MemoryTopologyRepository(breakerTopology());
    const alarms = new MemoryAlarmRepository();
    const policies = new MemoryAlarmPolicyRepository([
      {
        id: 'offline-guard-policy',
        targetType: 'EQUIPMENT',
        targetId: 'breaker',
        sourceContext: 'mqtt:0_1_4',
        sourceIdentity: 'EMU-TELXIUS-QDF-4',
        enabled: true,
        lowVoltage: {
          assertBelowV: 45,
          clearAboveV: 47,
          debounceSamples: 1,
          recoverySamples: 1,
          severity: 'WARNING',
        },
        powerLoss: {
          assertVoltageBelowV: 1,
          assertCurrentBelowA: 0.1,
          clearVoltageAboveV: 45,
          debounceSamples: 1,
          recoverySamples: 1,
          severity: 'CRITICAL',
        },
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    const evaluator = new TelemetryAlarmEvaluator(alarms, policies, topology);
    const offline = sample(0, 0, '2026-10-30T02:30:00.000Z');
    await evaluator.observe({
      ...offline,
      reported: {
        ...offline.reported,
        state: 'OFFLINE',
      },
    });

    expect(await alarms.listActive()).toHaveLength(0);
  });

  it('asserts configured power loss as suspected from electrical evidence only', async () => {
    const topology = new MemoryTopologyRepository(breakerTopology());
    const alarms = new MemoryAlarmRepository();
    const policies = new MemoryAlarmPolicyRepository([
      {
        id: 'power-policy',
        targetType: 'EQUIPMENT',
        targetId: 'breaker',
        sourceContext: 'mqtt:0_1_4',
        sourceIdentity: 'EMU-TELXIUS-QDF-4',
        enabled: true,
        powerLoss: {
          assertVoltageBelowV: 1,
          assertCurrentBelowA: 0.1,
          clearVoltageAboveV: 45,
          debounceSamples: 1,
          recoverySamples: 1,
          severity: 'CRITICAL',
        },
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    const evaluator = new TelemetryAlarmEvaluator(alarms, policies, topology);
    await evaluator.observe(sample(0.4, 0, '2026-10-30T02:20:00.000Z'));

    const active = await alarms.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.alarmCode).toBe('POWER_LOSS');
    expect(active[0]?.confidence).toBe('SUSPECTED');
    expect(active[0]?.evidenceRefs.map((item) => item.metric)).toEqual(['VOLTAGE', 'CURRENT']);
  });
});
