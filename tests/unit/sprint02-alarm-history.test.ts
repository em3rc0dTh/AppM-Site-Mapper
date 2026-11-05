import { describe, expect, it } from 'vitest';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { TopologyNode } from '@/modules/topology/domain/entities';

const T0 = '2026-11-05T10:00:00.000Z';
const T1 = '2026-11-05T10:01:00.000Z';

function setup() {
  const node = {
    id: 'breaker-a3-04',
    name: 'A3-04',
    kind: 'EQUIPMENT',
    lifecycle: 'ACTIVE',
    parentId: null,
    createdAt: T0,
    updatedAt: T0,
  } as unknown as TopologyNode;
  const topology = new MemoryTopologyRepository([node]);
  const repository = new MemoryAlarmRepository();
  return {
    repository,
    commands: new AlarmCommandService(repository, topology),
    service: new AlarmService(repository, topology),
  };
}

describe('S02 - durable alarm history and independent acknowledgement', () => {
  it('preserves a resolved, unacknowledged occurrence and permits subsequent ACK', async () => {
    const { repository, commands, service } = setup();
    const created = await commands.assert({
      code: 'OVERCURRENT',
      targetType: 'EQUIPMENT',
      targetId: 'breaker-a3-04',
      sourceContext: 'mqtt:A3-04',
      observedAt: T0,
      evidence: [{
        id: 'sample-01', kind: 'MQTT', metric: 'CURRENT', value: 24,
        unit: 'A', observedAt: T0, sourceIdentity: 'simulator',
        note: 'assertAboveA=20; provisional rating',
      }],
    });
    await commands.resolve(created.correlationKey, 'RECOVERY_POLICY_SATISFIED', [], T1);

    const historical = await service.snapshot({ includeResolved: true });
    expect(historical.global.activeAlarmCount).toBe(0);
    expect(historical.occurrences).toHaveLength(1);
    expect(historical.occurrences[0]?.lifecycle).toBe('RESOLVED');
    expect(historical.occurrences[0]?.acknowledgement).toBe('UNACKNOWLEDGED');
    expect(historical.occurrences[0]?.evidenceRefs[0]?.value).toBe(24);

    const acknowledged = await service.acknowledge(created.id, 'operator-1');
    expect(acknowledged.lifecycle).toBe('RESOLVED');
    expect(acknowledged.acknowledgement).toBe('ACKNOWLEDGED');
    expect((await repository.listActive())).toHaveLength(0);

    const events = await service.transitions(created.id);
    expect(events.map((event) => event.toState)).toEqual(['ACTIVE', 'RESOLVED', 'ACKNOWLEDGED']);
    expect(events[2]?.actorId).toBe('operator-1');
    expect((await service.acknowledge(created.id, 'operator-2')).acknowledgedBy).toBe('operator-1');
    expect(await service.transitions(created.id)).toHaveLength(3);
  });
});
