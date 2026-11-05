import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';

import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import { MongoAlarmRepository } from '@/modules/alarm/infrastructure/mongo-alarm-repository';
import { MongoAlarmPolicyRepository } from '@/modules/alarm/infrastructure/mongo-alarm-policy-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const enabled = process.env.CI_ALARM_ACCEPTANCE === 'true';
const uri = process.env.MONGODB_URI ?? '';
const databaseName = 'site_mapper_s02_acceptance_' + process.pid + '_' + Date.now();
const T0 = Date.parse('2026-11-05T10:00:00.000Z');

function at(step: number): string {
  return new Date(T0 + step * 1000).toISOString();
}

function source(currentA: number, step: number): TelemetrySample {
  const stamp = at(step);
  return {
    bindingId: 's02-binding',
    targetId: 'breaker',
    targetType: 'EQUIPMENT',
    entityId: 'breaker',
    entityKind: 'EQUIPMENT',
    sourceIdentity: 'S02-SYNTHETIC',
    sourcePointId: '0_1_4',
    protocol: 'BFDB',
    reported: { voltageV: { value: 48, observedAt: stamp }, currentA: { value: currentA, observedAt: stamp } },
    receivedAt: stamp,
    sourceObservedAt: stamp,
  };
}

function topology(): MemoryTopologyRepository {
  const nodes = [
    { id: 'rack', name: 'QDF-LAB', kind: 'CONTAINER_RACK', parentId: null, lifecycle: 'ACTIVE', createdAt: at(0), updatedAt: at(0) },
    { id: 'device', name: 'BDFB-LAB', kind: 'DEVICE', parentId: 'rack', lifecycle: 'ACTIVE', createdAt: at(0), updatedAt: at(0) },
    {
      id: 'breaker', name: 'A3-04', kind: 'EQUIPMENT', parentId: 'device', parentEquipmentId: null,
      deviceId: 'device', equipmentType: 'CIRCUIT_BREAKER', childMode: 'DYNAMIC',
      children: [], accessPorts: [], pinned: false, lifecycle: 'ACTIVE', createdAt: at(0), updatedAt: at(0),
    },
  ] as unknown as TopologyNode[];
  return new MemoryTopologyRepository(nodes);
}

describe.skipIf(!enabled)('S02 real MongoDB alarm acceptance (disposable DB only)', () => {
  let client: MongoClient;
  let repo: MongoAlarmRepository;
  let service: AlarmService;
  let evaluator: TelemetryAlarmEvaluator;

  beforeAll(async () => {
    if (process.env.APP_ENV !== 'test' || !/^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[\w-]+$/.test(uri)) {
      throw new Error('S02 requires an isolated loopback MongoDB test replica set');
    }
    client = await MongoClient.connect(uri);
    const db = client.db(databaseName);
    await ensurePersistenceIndexes(db);
    await db.collection('alarm_policies').insertOne({
      id: 's02-policy', targetId: 'breaker', targetType: 'EQUIPMENT',
      sourceContext: 'mqtt:0_1_4', sourceIdentity: 'S02-SYNTHETIC', enabled: true,
      overcurrent: {
        assertAboveA: 20, clearBelowA: 18, debounceSamples: 3, recoverySamples: 3, severity: 'WARNING',
      },
      createdAt: at(0), updatedAt: at(0),
    });
    const tree = topology();
    repo = new MongoAlarmRepository(db);
    service = new AlarmService(repo, tree);
    evaluator = new TelemetryAlarmEvaluator(repo, new MongoAlarmPolicyRepository(db), tree);
  });

  afterAll(async () => {
    if (client) {
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  });

  it('asserts after debounce, ACKs independently, recovers and retains evidence in Mongo', async () => {
    await evaluator.observe(source(12, 1));
    await evaluator.observe(source(21, 2));
    await evaluator.observe(source(23, 3));
    expect(await repo.listActive()).toHaveLength(0);

    await evaluator.observe(source(24, 4));
    const [raised] = await repo.listActive();
    expect(raised).toMatchObject({ lifecycle: 'ACTIVE', acknowledgement: 'UNACKNOWLEDGED', targetId: 'breaker' });
    expect(raised?.targetPathSnapshot?.at(-1)?.name).toBe('A3-04');
    expect(raised?.evidenceRefs[0]).toMatchObject({
      metric: 'CURRENT', value: 24, unit: 'A', assertThreshold: 20, clearThreshold: 18, policyId: 's02-policy',
    });

    await service.acknowledge(raised!.id, 's02-operator');
    expect((await repo.getOccurrence(raised!.id))?.lifecycle).toBe('ACTIVE');
    expect((await repo.getOccurrence(raised!.id))?.acknowledgement).toBe('ACKNOWLEDGED');

    await evaluator.observe(source(19, 5));
    await evaluator.observe(source(17, 6));
    await evaluator.observe(source(16, 7));
    expect(await repo.listActive()).toHaveLength(1);
    await evaluator.observe(source(15, 8));
    expect(await repo.listActive()).toHaveLength(0);

    const restored = new MongoAlarmRepository(client.db(databaseName));
    const resolved = await restored.getOccurrence(raised!.id);
    expect(resolved).toMatchObject({ lifecycle: 'RESOLVED', acknowledgement: 'ACKNOWLEDGED' });
    expect(resolved?.evidenceRefs.some((item) => item.metric === 'CURRENT' && item.value === 15)).toBe(true);
    const transitions = await restored.listTransitions(raised!.id);
    expect(transitions.map((item) => item.toState)).toEqual(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']);
    expect(transitions.at(-1)?.evidenceRefs.length).toBeGreaterThan(0);

    const history = await service.history({ limit: 50, lifecycle: 'RESOLVED', targetId: 'breaker' });
    expect(history.items.some((item) => item.id === raised!.id)).toBe(true);

    await evaluator.observe(source(25, 9));
    await evaluator.observe(source(26, 10));
    await evaluator.observe(source(27, 11));
    const [repeated] = await repo.listActive();
    expect(repeated?.id).not.toBe(raised!.id);
    expect((await repo.getOccurrence(raised!.id))?.lifecycle).toBe('RESOLVED');
  });

  it('permits ACK after an occurrence already resolved, without reactivation or duplicate ACK', async () => {
    const active = (await repo.listActive())[0]!;
    await evaluator.observe(source(17, 12));
    await evaluator.observe(source(16, 13));
    await evaluator.observe(source(15, 14));
    expect(await repo.listActive()).toHaveLength(0);
    expect((await repo.getOccurrence(active.id))?.acknowledgement).toBe('UNACKNOWLEDGED');
    await service.acknowledge(active.id, 'late-operator');
    await service.acknowledge(active.id, 'second-operator');
    const final = await repo.getOccurrence(active.id);
    expect(final).toMatchObject({ lifecycle: 'RESOLVED', acknowledgement: 'ACKNOWLEDGED', acknowledgedBy: 'late-operator' });
    expect((await repo.listTransitions(active.id)).filter((transition) => transition.toState === 'ACKNOWLEDGED')).toHaveLength(1);
    expect(await repo.listActive()).toHaveLength(0);
  });

  it('paginates 526+ real Mongo occurrences without duplicates with server filters', async () => {
    const baseline = (await repo.listResolved(100))[0]!;
    await client.db(databaseName).collection('alarm_occurrences').insertMany(
      Array.from({ length: 525 }, (_, index) => ({
        ...baseline, _id: undefined, id: 's02-history-' + String(index).padStart(4, '0'),
        correlationKey: 's02-history-' + index,
        openedAt: at(20), lastObservedAt: at(20), resolvedAt: at(21), lifecycle: 'RESOLVED',
      })),
    );
    const found = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await repo.listHistory({ limit: 100, lifecycle: 'RESOLVED', targetId: 'breaker', ...(cursor ? { cursor } : {}) });
      for (const item of page.items) {
        expect(found.has(item.id)).toBe(false);
        found.add(item.id);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(found.size).toBeGreaterThanOrEqual(527);
    const ack = await repo.listHistory({ limit: 100, lifecycle: 'RESOLVED', acknowledgement: 'ACKNOWLEDGED' });
    expect(ack.items.every((item) => item.acknowledgement === 'ACKNOWLEDGED')).toBe(true);
  });
});
