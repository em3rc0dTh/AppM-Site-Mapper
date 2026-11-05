import { describe, expect, it } from 'vitest';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { projectAlarmPublicationSignals } from '@/modules/alarm/application/alarm-modbus-projection';
import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { IndustrialAlarmEvaluator } from '@/modules/alarm/application/industrial-alarm-evaluator';
import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import type { AlarmOccurrence, AlarmTransition } from '@/modules/alarm/domain/entities';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';
import type { ObservationBatch, Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const T0 = '2026-10-30T02:00:00.000Z';
const T1 = '2026-10-30T02:10:00.000Z';
const T2 = '2026-10-30T02:20:00.000Z';
const T3 = '2026-10-30T02:30:00.000Z';

function topology(): readonly TopologyNode[] {
  return [
    {
      id: 'rack',
      name: 'QDF4',
      kind: 'CONTAINER_RACK',
      parentId: null,
      lifecycle: 'ACTIVE',
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: 'device',
      name: 'BDFB QDF-4',
      kind: 'DEVICE',
      parentId: 'rack',
      lifecycle: 'ACTIVE',
      createdAt: T0,
      updatedAt: T0,
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
      createdAt: T0,
      updatedAt: T0,
    },
  ] as unknown as readonly TopologyNode[];
}

function telemetry(voltageV: number, currentA: number, receivedAt: string): TelemetrySample {
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
    sourceObservedAt: receivedAt,
    reported: {
      voltageV: { value: voltageV, unit: 'V', observedAt: receivedAt },
      currentA: { value: currentA, unit: 'A', observedAt: receivedAt },
    },
  };
}

function snmp(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'snmp-signal',
    key: '1.3.6.1.4.1.12148.1.2.3.0',
    sourceIdentity: 'EMU-SMARTPACK2-LURIN',
    protocol: 'SNMP',
    targetId: 'breaker',
    kind: 'alarm',
    mibName: 'fuseAlarm',
    interpretation: 'PROFILE',
    rawType: 'number',
    rawValue: 1,
    value: 1,
    unit: null,
    scale: null,
    quality: 'VALID',
    alarmState: 'ACTIVE',
    severity: 'CRITICAL',
    alarmCode: 'FUSE_ALARM',
    interpretationEvidence: 'Red-team commissioned fixture.',
    profileVersion: 'redteam-v1',
    receivedAt: T2,
    observedAt: T2,
    staleMs: 120000,
    eventId: 'snmp-redteam-event',
    ...overrides,
  };
}

function batch(signal: Signal): ObservationBatch {
  return {
    id: signal.eventId,
    envelope: {
      protocol: 'SNMP',
      sourceIdentity: signal.sourceIdentity,
      transport: 'get',
      receivedAt: signal.receivedAt,
      observedAt: signal.observedAt,
      raw: { varbinds: [] },
    },
    signals: [signal],
  };
}

function powerLossPolicy(): AlarmPolicy {
  return {
    id: 'power-loss-redteam',
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
    createdAt: T0,
    updatedAt: T0,
  };
}

class BlockingAckRepository implements AlarmRepository {
  private readonly inner = new MemoryAlarmRepository();
  private releaseAck!: () => void;
  private markAckBlocked!: () => void;
  private readonly ackGate = new Promise<void>((resolve) => {
    this.releaseAck = resolve;
  });
  readonly ackBlocked = new Promise<void>((resolve) => {
    this.markAckBlocked = resolve;
  });

  releaseAckWrite(): void {
    this.releaseAck();
  }

  getOccurrence(id: string): Promise<AlarmOccurrence | null> {
    return this.inner.getOccurrence(id);
  }

  getActiveByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null> {
    return this.inner.getActiveByCorrelationKey(correlationKey);
  }

  getLatestByCorrelationKey(correlationKey: string): Promise<AlarmOccurrence | null> {
    return this.inner.getLatestByCorrelationKey(correlationKey);
  }

  listActive(): Promise<readonly AlarmOccurrence[]> {
    return this.inner.listActive();
  }

  listResolved(limit?: number): Promise<readonly AlarmOccurrence[]> {
    return this.inner.listResolved(limit);
  }

  listHistory(query: import('@/modules/alarm/application/alarm-history').AlarmHistoryQuery) {
    return this.inner.listHistory(query);
  }

  insertOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    return this.inner.insertOccurrence(occurrence);
  }

  async replaceOccurrence(occurrence: AlarmOccurrence): Promise<void> {
    if (occurrence.lifecycle === 'ACTIVE' && occurrence.acknowledgement === 'ACKNOWLEDGED') {
      this.markAckBlocked();
      await this.ackGate;
    }
    await this.inner.replaceOccurrence(occurrence);
  }

  insertTransition(transition: AlarmTransition): Promise<void> {
    return this.inner.insertTransition(transition);
  }

  listTransitions(occurrenceId: string): Promise<readonly AlarmTransition[]> {
    return this.inner.listTransitions(occurrenceId);
  }
}

describe('Alarm red-team invariants', () => {
  it('does not reopen POWER_LOSS from telemetry older than its successful recovery', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const evaluator = new TelemetryAlarmEvaluator(
      alarms,
      new MemoryAlarmPolicyRepository([powerLossPolicy()]),
      topologyRepository,
    );

    await evaluator.observe(telemetry(0.4, 0, T2));
    expect(await alarms.listActive()).toHaveLength(1);

    await evaluator.observe(telemetry(48, 0, T3));
    expect(await alarms.listActive()).toHaveLength(0);
    expect(await alarms.listResolved()).toHaveLength(1);

    await evaluator.observe(telemetry(0.4, 0, T1));

    expect(await alarms.listActive()).toHaveLength(0);
    expect(await alarms.listResolved()).toHaveLength(1);
  });

  it('does not let an older SNMP clear resolve a newer active hardware alarm', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const evaluator = new IndustrialAlarmEvaluator(alarms, topologyRepository);

    await evaluator.observe(batch(snmp({ observedAt: T2, receivedAt: T2 })));
    expect(await alarms.listActive()).toHaveLength(1);

    await evaluator.observe(
      batch(
        snmp({
          id: 'snmp-old-clear',
          eventId: 'snmp-old-clear-event',
          rawValue: 0,
          value: 0,
          alarmState: 'RESOLVED',
          observedAt: T1,
          receivedAt: T3,
        }),
      ),
    );

    const active = await alarms.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.lastObservedAt).toBe(T2);
  });

  it('does not append duplicate evidence when the same SNMP event is replayed', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const evaluator = new IndustrialAlarmEvaluator(alarms, topologyRepository);
    const replay = batch(snmp());

    await evaluator.observe(replay);
    await evaluator.observe(replay);

    const active = await alarms.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.evidenceRefs).toHaveLength(1);
  });

  it('keeps one active occurrence under concurrent identical assertions', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const commands = new AlarmCommandService(alarms, topologyRepository);

    await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        commands.assert({
          code: 'POWER_LOSS',
          targetType: 'EQUIPMENT',
          targetId: 'breaker',
          sourceContext: 'mqtt:0_1_4',
          confidence: 'SUSPECTED',
          observedAt: T2,
          evidence: [
            {
              id: 'concurrent-' + index,
              kind: 'MQTT',
              sourceIdentity: 'EMU-TELXIUS-QDF-4',
              sourcePointId: '0_1_4',
              metric: 'VOLTAGE',
              value: 0,
              unit: 'V',
              observedAt: T2,
            },
          ],
        }),
      ),
    );

    const active = await alarms.listActive();
    expect(active.filter((item) => item.alarmCode === 'POWER_LOSS')).toHaveLength(1);
  });

  it('cannot resurrect a resolved alarm when ACK races with resolution', async () => {
    const alarms = new BlockingAckRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const commands = new AlarmCommandService(alarms, topologyRepository);
    const service = new AlarmService(alarms, topologyRepository);

    const occurrence = await commands.assert({
      code: 'POWER_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'mqtt:0_1_4',
      observedAt: T2,
      confidence: 'SUSPECTED',
      evidence: [],
    });

    const acknowledge = service.acknowledge(occurrence.id, 'redteam-operator');
    await alarms.ackBlocked;

    await commands.resolve(occurrence.correlationKey, 'REDTEAM_CLEAR', [], T3);
    alarms.releaseAckWrite();
    await acknowledge;

    const final = await alarms.getOccurrence(occurrence.id);
    expect(final?.lifecycle).toBe('RESOLVED');
  });

  it('does not publish an unknown alarm code to Modbus as a valid clear state', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());

    const [state] = await projectAlarmPublicationSignals(
      [
        {
          signalId: 'a'.repeat(64),
          logicalPointId: 'ALARM/breaker/POWER_LOS/STATE',
        },
      ],
      alarms,
      topologyRepository,
      T3,
    );

    expect(state?.value).toBeNull();
    expect(state?.quality).toBe('INVALID');
    expect(state?.alarmState).toBe('UNKNOWN');
  });

  it('acknowledges a resolved alarm without reactivating it', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const commands = new AlarmCommandService(alarms, topologyRepository);
    const service = new AlarmService(alarms, topologyRepository);

    const occurrence = await commands.assert({
      code: 'FUSE_ALARM',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'snmp:controller:fuse',
      observedAt: T2,
      evidence: [],
    });
    await commands.resolve(occurrence.correlationKey, 'REDTEAM_CLEAR', [], T3);

    const acknowledged = await service.acknowledge(occurrence.id, 'redteam-operator');
    expect(acknowledged.lifecycle).toBe('RESOLVED');
    expect(acknowledged.acknowledgement).toBe('ACKNOWLEDGED');
    expect((await alarms.listActive())).toHaveLength(0);
    expect((await service.transitions(occurrence.id)).at(-1)?.toState).toBe('ACKNOWLEDGED');
  });

  it('keeps an unknown target out of a valid Modbus projection', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());

    const [state] = await projectAlarmPublicationSignals(
      [
        {
          signalId: 'b'.repeat(64),
          logicalPointId: 'ALARM/missing-target/POWER_LOSS/STATE',
        },
      ],
      alarms,
      topologyRepository,
      T3,
    );

    expect(state?.value).toBeNull();
    expect(state?.quality).toBe('INVALID');
    expect(state?.alarmState).toBe('UNKNOWN');
  });
});
