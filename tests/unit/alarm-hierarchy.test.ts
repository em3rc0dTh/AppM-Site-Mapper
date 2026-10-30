import { describe, expect, it } from 'vitest';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const now = '2026-10-30T02:30:00.000Z';

function base(id: string, name: string, kind: TopologyNode['kind'], parentId: string | null) {
  return { id, name, kind, parentId, lifecycle: 'ACTIVE' as const, createdAt: now, updatedAt: now };
}

function topology(): readonly TopologyNode[] {
  return [
    { ...base('network', 'SITE MAPPER', 'NETWORK', null), kind: 'NETWORK', parentId: null },
    { ...base('site', 'TELXIUS LURÍN', 'SITE', 'network'), kind: 'SITE' },
    { ...base('structure', 'EDIFICIO PRINCIPAL', 'STRUCTURE', 'site'), kind: 'STRUCTURE' },
    { ...base('level', 'LEVEL 00', 'LEVEL', 'structure'), kind: 'LEVEL' },
    {
      ...base('room', 'SALA DE TRANSMISIONES', 'ROOM_SUBSTRUCTURE', 'level'),
      kind: 'ROOM_SUBSTRUCTURE',
      variant: 'ROOM',
    },
    {
      ...base('bay', 'CONTAINED-CLUSTER-04', 'CONTAINER_CLUSTER_BAY', 'room'),
      kind: 'CONTAINER_CLUSTER_BAY',
      variant: 'CONTAINER_CLUSTER',
    },
    {
      ...base('position', 'QDF4 ANCHOR', 'POSITION', 'bay'),
      kind: 'POSITION',
      coordinate: { row: 'A', column: 1 },
    },
    {
      ...base('rack', 'QDF4', 'CONTAINER_RACK', 'position'),
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      cas: [],
    },
    {
      ...base('bdfb', 'BDFB QDF-4', 'DEVICE', 'rack'),
      kind: 'DEVICE',
      pinned: false,
      deviceType: 'BDFB',
      rootEquipmentIds: ['chassis'],
    },
    {
      ...base('chassis', 'QDF-4 Chassis', 'EQUIPMENT', 'bdfb'),
      kind: 'EQUIPMENT',
      deviceId: 'bdfb',
      equipmentType: 'CHASSIS',
      parentEquipmentId: null,
      childMode: 'POSITIONAL',
      children: ['shelf'],
      accessPorts: [],
      pinned: false,
    },
    {
      ...base('shelf', 'QDF-4-SHELF-01', 'EQUIPMENT', 'chassis'),
      kind: 'EQUIPMENT',
      deviceId: 'bdfb',
      equipmentType: 'SHELF',
      parentEquipmentId: 'chassis',
      childMode: 'POSITIONAL',
      children: ['frame'],
      accessPorts: [],
      pinned: false,
    },
    {
      ...base('frame', 'QDF-4-SHELF-01-FRAME-01', 'EQUIPMENT', 'shelf'),
      kind: 'EQUIPMENT',
      deviceId: 'bdfb',
      equipmentType: 'FRAME',
      parentEquipmentId: 'shelf',
      childMode: 'POSITIONAL',
      children: ['panel'],
      accessPorts: [],
      pinned: false,
    },
    {
      ...base('panel', 'A3', 'EQUIPMENT', 'frame'),
      kind: 'EQUIPMENT',
      deviceId: 'bdfb',
      equipmentType: 'PANEL',
      parentEquipmentId: 'frame',
      childMode: 'POSITIONAL',
      children: ['breaker'],
      accessPorts: [],
      pinned: false,
    },
    {
      ...base('breaker', 'A3-04', 'EQUIPMENT', 'panel'),
      kind: 'EQUIPMENT',
      deviceId: 'bdfb',
      equipmentType: 'CIRCUIT_BREAKER',
      parentEquipmentId: 'panel',
      childMode: 'DYNAMIC',
      children: [],
      accessPorts: [],
      pinned: false,
    },
  ];
}

describe('alarm hierarchy', () => {
  it('projects one breaker occurrence to every canonical ancestor without duplication', async () => {
    const topologyRepo = new MemoryTopologyRepository(topology());
    const alarmRepo = new MemoryAlarmRepository();
    const commands = new AlarmCommandService(alarmRepo, topologyRepo);
    const query = new AlarmService(alarmRepo, topologyRepo);

    const occurrence = await commands.assert({
      code: 'POWER_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'mqtt:EMU-TELXIUS-QDF-4:0_1_4',
      severity: 'CRITICAL',
      confidence: 'CONFIRMED',
      evidence: [
        {
          id: 'evidence-1',
          kind: 'MQTT',
          sourceIdentity: 'EMU-TELXIUS-QDF-4',
          sourcePointId: '0_1_4',
          metric: 'CURRENT',
          value: 0,
          unit: 'A',
          observedAt: now,
        },
      ],
      observedAt: now,
    });

    const snapshot = await query.snapshot();
    expect(snapshot.occurrences).toHaveLength(1);
    expect(snapshot.global.activeAlarmCount).toBe(1);
    expect(snapshot.rollups.breaker?.directActiveAlarmCount).toBe(1);

    for (const ancestor of ['panel', 'frame', 'shelf', 'chassis', 'bdfb', 'rack']) {
      expect(snapshot.rollups[ancestor]?.activeAlarmCount).toBe(1);
      expect(snapshot.rollups[ancestor]?.descendantActiveAlarmCount).toBe(1);
    }

    expect(snapshot.rollups.panel?.affectedChildren).toEqual([
      expect.objectContaining({ id: 'breaker', activeAlarmCount: 1 }),
    ]);
    expect(snapshot.rollups.frame?.affectedChildren).toEqual([
      expect.objectContaining({ id: 'panel', activeAlarmCount: 1 }),
    ]);
    expect(snapshot.occurrences[0]?.id).toBe(occurrence.id);
  });

  it('deduplicates repeated assertion and keeps ACK independent from resolution', async () => {
    const topologyRepo = new MemoryTopologyRepository(topology());
    const alarmRepo = new MemoryAlarmRepository();
    const commands = new AlarmCommandService(alarmRepo, topologyRepo);
    const query = new AlarmService(alarmRepo, topologyRepo);

    const first = await commands.assert({
      code: 'TELEMETRY_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'watchdog:mqtt',
      evidence: [],
      observedAt: now,
    });
    const repeated = await commands.assert({
      code: 'TELEMETRY_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'watchdog:mqtt',
      evidence: [],
      observedAt: '2026-10-30T02:31:00.000Z',
    });

    expect(repeated.id).toBe(first.id);
    expect((await alarmRepo.listActive())).toHaveLength(1);

    const acknowledged = await query.acknowledge(first.id, 'operator-1');
    expect(acknowledged.lifecycle).toBe('ACTIVE');
    expect(acknowledged.acknowledgement).toBe('ACKNOWLEDGED');

    await commands.resolve(
      first.correlationKey,
      'RECOVERY_POLICY_SATISFIED',
      [],
      '2026-10-30T02:32:00.000Z',
    );
    expect((await query.snapshot()).global.activeAlarmCount).toBe(0);

    const recurrence = await commands.assert({
      code: 'TELEMETRY_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'watchdog:mqtt',
      evidence: [],
      observedAt: '2026-10-30T02:33:00.000Z',
    });
    expect(recurrence.id).not.toBe(first.id);
  });
});
