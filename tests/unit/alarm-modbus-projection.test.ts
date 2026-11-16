import { describe, expect, it } from 'vitest';

import {
  parseAlarmPublicationLogicalPoint,
  projectAlarmPublicationSignals,
} from '@/modules/alarm/application/alarm-modbus-projection';
import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
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

describe('Alarm Modbus projection', () => {
  it('accepts only the governed logical-point grammar', () => {
    expect(parseAlarmPublicationLogicalPoint('ALARM/breaker/POWER_LOSS/STATE')).toEqual({
      targetId: 'breaker',
      alarmCode: 'POWER_LOSS',
      field: 'STATE',
    });
    expect(parseAlarmPublicationLogicalPoint('ALARM/breaker/POWER_LOSS/UNKNOWN')).toBeNull();
    expect(parseAlarmPublicationLogicalPoint('QDF4.A3.POWER_LOSS')).toBeNull();
  });

  it('projects active state, ACK, severity, confidence and quality without occurrence UUIDs', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());
    const commands = new AlarmCommandService(alarms, topologyRepository);
    const query = new AlarmService(alarms, topologyRepository);

    const occurrence = await commands.assert({
      code: 'POWER_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'mqtt:0_1_4',
      severity: 'CRITICAL',
      confidence: 'CONFIRMED',
      observedAt: '2026-10-30T02:20:00.000Z',
      evidence: [
        {
          id: 'evidence',
          kind: 'MQTT',
          sourceIdentity: 'EMU-TELXIUS-QDF-4',
          metric: 'VOLTAGE',
          value: 0,
          unit: 'V',
          observedAt: '2026-10-30T02:20:00.000Z',
        },
      ],
    });
    await query.acknowledge(occurrence.id, 'operator');

    const fields = ['STATE', 'ACK', 'SEVERITY', 'CONFIDENCE', 'QUALITY'] as const;
    const projected = await projectAlarmPublicationSignals(
      fields.map((field, index) => ({
        signalId: String(index + 1).repeat(64),
        logicalPointId: `ALARM/breaker/POWER_LOSS/${field}`,
      })),
      alarms,
      topologyRepository,
      '2026-10-30T02:21:00.000Z',
    );

    expect(projected.map((item) => item.value)).toEqual([1, 1, 3, 2, 1]);
    expect(projected[0]?.kind).toBe('alarm');
    expect(projected[0]?.alarmState).toBe('ACTIVE');
    expect(projected.every((item) => item.protocol === 'ALARM')).toBe(true);
    expect(projected.every((item) => item.quality === 'VALID')).toBe(true);
  });

  it('projects a clear state when no active occurrence exists for a valid target', async () => {
    const alarms = new MemoryAlarmRepository();
    const topologyRepository = new MemoryTopologyRepository(topology());

    const [state] = await projectAlarmPublicationSignals(
      [
        {
          signalId: 'f'.repeat(64),
          logicalPointId: 'ALARM/breaker/POWER_LOSS/STATE',
        },
      ],
      alarms,
      topologyRepository,
      '2026-10-30T02:21:00.000Z',
    );

    expect(state?.value).toBe(0);
    expect(state?.alarmState).toBe('RESOLVED');
    expect(state?.quality).toBe('VALID');
  });
});
