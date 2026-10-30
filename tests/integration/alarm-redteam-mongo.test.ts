import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { MongoAlarmRepository } from '@/modules/alarm/infrastructure/mongo-alarm-repository';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const uri = process.env.ALARM_REDTEAM_MONGO_URI;
const databaseName = 'alarm_redteam_' + Date.now();
const observedAt = '2026-10-30T03:00:00.000Z';

function topology(): readonly TopologyNode[] {
  return [
    {
      id: 'rack',
      name: 'QDF4',
      kind: 'CONTAINER_RACK',
      parentId: null,
      lifecycle: 'ACTIVE',
      createdAt: observedAt,
      updatedAt: observedAt,
    },
    {
      id: 'device',
      name: 'BDFB QDF-4',
      kind: 'DEVICE',
      parentId: 'rack',
      lifecycle: 'ACTIVE',
      createdAt: observedAt,
      updatedAt: observedAt,
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
      createdAt: observedAt,
      updatedAt: observedAt,
    },
  ] as unknown as readonly TopologyNode[];
}

describe.skipIf(!uri)('Alarm red-team real Mongo concurrency', () => {
  let client: MongoClient;

  beforeAll(async () => {
    client = await MongoClient.connect(uri!);
    await ensurePersistenceIndexes(client.db(databaseName));
  });

  afterAll(async () => {
    await client?.db(databaseName).dropDatabase();
    await client?.close();
  });

  it('treats concurrent identical assertions as idempotent success', async () => {
    const database = client.db(databaseName);
    const repository = new MongoAlarmRepository(database);
    const commands = new AlarmCommandService(
      repository,
      new MemoryTopologyRepository(topology()),
    );

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, (_, index) =>
        commands.assert({
          code: 'POWER_LOSS',
          targetType: 'EQUIPMENT',
          targetId: 'breaker',
          sourceContext: 'mqtt:0_1_4',
          confidence: 'SUSPECTED',
          observedAt,
          evidence: [
            {
              id: 'mongo-concurrent-' + index,
              kind: 'MQTT',
              sourceIdentity: 'EMU-TELXIUS-QDF-4',
              sourcePointId: '0_1_4',
              metric: 'VOLTAGE',
              value: 0,
              unit: 'V',
              observedAt,
            },
          ],
        }),
      ),
    );

    const rejected = results.filter((item) => item.status === 'rejected');
    const active = await repository.listActive();

    expect(rejected).toHaveLength(0);
    expect(
      active.filter((item) => item.correlationKey === 'breaker|POWER_LOSS|mqtt:0_1_4'),
    ).toHaveLength(1);
  });
});
