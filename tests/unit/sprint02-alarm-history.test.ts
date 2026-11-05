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
    expect(created.targetPathSnapshot?.at(-1)?.name).toBe('A3-04');
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

describe('S02 - history pagination and evidence retention', () => {
  it('paginates beyond 500 occurrences without duplicates, including equal timestamps', async () => {
    const { repository, commands } = setup();
    const first = await commands.assert({
      code: 'OVERCURRENT',
      targetType: 'EQUIPMENT',
      targetId: 'breaker-a3-04',
      sourceContext: 'mqtt:baseline',
      evidence: [],
      observedAt: T0,
    });
    await Promise.all(Array.from({ length: 525 }, (_, index) =>
      repository.insertOccurrence({
        ...first,
        id: 'history-' + String(index).padStart(4, '0'),
        correlationKey: 'unique-history-' + index,
        lifecycle: index % 2 === 0 ? 'RESOLVED' : 'ACTIVE',
        acknowledgement: index % 3 === 0 ? 'ACKNOWLEDGED' : 'UNACKNOWLEDGED',
      }),
    ));

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pageCount = 0;
    do {
      const page = await repository.listHistory({ limit: 100, ...(cursor ? { cursor } : {}) });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor ?? undefined;
      pageCount += 1;
    } while (cursor);
    expect(seen.size).toBe(526);
    expect(pageCount).toBe(6);

    const filtered = await repository.listHistory({
      limit: 100,
      lifecycle: 'RESOLVED',
      acknowledgement: 'ACKNOWLEDGED',
      targetId: 'breaker-a3-04',
      fromDate: '2026-11-05',
      toDate: '2026-11-05',
    });
    expect(filtered.items.length).toBeGreaterThan(0);
    expect(filtered.items.every((item) =>
      item.lifecycle === 'RESOLVED' && item.acknowledgement === 'ACKNOWLEDGED'
    )).toBe(true);
  });

  it('persists recovery readings and their references into the resolved event log', async () => {
    const { commands, service } = setup();
    const created = await commands.assert({
      code: 'OVERCURRENT',
      targetType: 'EQUIPMENT',
      targetId: 'breaker-a3-04',
      sourceContext: 'mqtt:A3-04',
      observedAt: T0,
      evidence: [{
        id: 'trigger', kind: 'MQTT', metric: 'CURRENT', value: 24, unit: 'A',
        assertThreshold: 20, clearThreshold: 18, thresholdUnit: 'A',
        policyId: 'policy-1', observedAt: T0,
      }],
    });
    await commands.resolve(created.correlationKey, 'RECOVERY_POLICY_SATISFIED', [], T1, [{
      id: 'recovery', kind: 'MQTT', metric: 'CURRENT', value: 17, unit: 'A',
      assertThreshold: 20, clearThreshold: 18, thresholdUnit: 'A',
      policyId: 'policy-1', observedAt: T1,
    }]);
    const alarm = await service.getOccurrenceView(created.id);
    expect(alarm?.lifecycle).toBe('RESOLVED');
    expect(alarm?.evidenceRefs.map((item) => item.id)).toEqual(['trigger', 'recovery']);
    const transitions = await service.transitions(created.id);
    expect(transitions[1]?.evidenceRefs).toContain('recovery');
  });
});
