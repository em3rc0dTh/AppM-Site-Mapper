import { describe, expect, it } from 'vitest';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { IndustrialAlarmEvaluator } from '@/modules/alarm/application/industrial-alarm-evaluator';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import type { ObservationBatch, Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const createdAt = '2026-10-30T02:00:00.000Z';

function topology(): readonly TopologyNode[] {
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

function signal(overrides: Partial<Signal> = {}): Signal {
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
    profileVersion: 'lab-v1',
    receivedAt: '2026-10-30T02:20:01.000Z',
    observedAt: '2026-10-30T02:20:01.000Z',
    staleMs: 120000,
    eventId: 'event-snmp-1',
    ...overrides,
  };
}

function batch(item: Signal): ObservationBatch {
  return {
    id: item.eventId,
    envelope: {
      protocol: 'SNMP',
      sourceIdentity: item.sourceIdentity,
      transport: 'get',
      receivedAt: item.receivedAt,
      observedAt: item.observedAt,
      raw: { varbinds: [] },
    },
    signals: [item],
  };
}

describe('IndustrialAlarmEvaluator', () => {
  it('ignores SNMP alarm semantics not explicitly commissioned', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const evaluator = new IndustrialAlarmEvaluator(alarms, topologyRepository);

    await evaluator.observe(batch(signal()));

    expect(await alarms.listActive()).toHaveLength(0);
  });

  it('opens and explicitly clears a commissioned hardware alarm', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const evaluator = new IndustrialAlarmEvaluator(alarms, topologyRepository);

    await evaluator.observe(
      batch(
        signal({
          alarmCode: 'FUSE_ALARM',
          interpretationEvidence: 'Commissioned fuse-open OID for this controller and breaker.',
        }),
      ),
    );

    const active = await alarms.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]?.alarmCode).toBe('FUSE_ALARM');
    expect(active[0]?.targetId).toBe('breaker');
    expect(active[0]?.evidenceRefs[0]?.kind).toBe('SNMP');

    await evaluator.observe(
      batch(
        signal({
          eventId: 'event-snmp-2',
          receivedAt: '2026-10-30T02:20:11.000Z',
          observedAt: '2026-10-30T02:20:11.000Z',
          rawValue: 0,
          value: 0,
          alarmState: 'RESOLVED',
          alarmCode: 'FUSE_ALARM',
          interpretationEvidence: 'Commissioned fuse-open OID for this controller and breaker.',
        }),
      ),
    );

    expect(await alarms.listActive()).toHaveLength(0);
    expect(await alarms.listResolved()).toHaveLength(1);
  });

  it('confirms existing POWER_LOSS with commissioned SNMP evidence', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const commands = new AlarmCommandService(alarms, topologyRepository);
    const evaluator = new IndustrialAlarmEvaluator(alarms, topologyRepository);

    const power = await commands.assert({
      code: 'POWER_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'mqtt:0_1_4',
      observedAt: '2026-10-30T02:20:00.000Z',
      confidence: 'SUSPECTED',
      evidence: [
        {
          id: 'mqtt-voltage',
          kind: 'MQTT',
          sourceIdentity: 'EMU-TELXIUS-QDF-4',
          sourcePointId: '0_1_4',
          metric: 'VOLTAGE',
          value: 0.4,
          unit: 'V',
          observedAt: '2026-10-30T02:20:00.000Z',
        },
      ],
    });

    await evaluator.observe(
      batch(
        signal({
          corroboratesAlarmCodes: ['POWER_LOSS'],
          interpretationEvidence:
            'Independent commissioned fuse alarm corroborates electrical loss.',
        }),
      ),
    );

    const active = await alarms.listActive();
    const confirmed = active.find((item) => item.id === power.id);
    expect(active.filter((item) => item.alarmCode === 'POWER_LOSS')).toHaveLength(1);
    expect(confirmed?.confidence).toBe('CONFIRMED');
    expect(confirmed?.sourceContext).toBe('mqtt:0_1_4');
    expect(confirmed?.evidenceRefs.some((item) => item.kind === 'SNMP')).toBe(true);
  });
});
