import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';

import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MongoAlarmRepository } from '@/modules/alarm/infrastructure/mongo-alarm-repository';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MongoTelemetryWatchRepository } from '@/modules/telemetry/infrastructure/mongo-telemetry-watch-repository';
import type { DeviceNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';

const enabled = process.env.CI_ALARM_ACCEPTANCE === 'true';
const uri = process.env.MONGODB_URI ?? '';
const databaseName = 'automatic_operational_commissioning_' + process.pid + '_' + Date.now();
const SOURCE = 'AUTO-MONGO-QDF-5';
const T0 = Date.parse('2026-11-10T15:00:00.000Z');

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function sourceSample(offsetMs: number): TelemetrySample {
  return {
    bindingId: 'auto:mqtt:' + SOURCE,
    targetId: 'device',
    targetType: 'DEVICE',
    entityId: 'device',
    entityKind: 'DEVICE',
    sourceIdentity: SOURCE,
    reported: {},
    receivedAt: at(offsetMs),
    protocol: 'BFDB',
  };
}

describe.skipIf(!enabled)('automatic operational monitoring with disposable MongoDB', () => {
  let client: MongoClient;

  beforeAll(async () => {
    if (
      process.env.APP_ENV !== 'test' ||
      !/^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[\w-]+$/.test(uri)
    ) {
      throw new Error(
        'Automatic watch acceptance requires an isolated loopback MongoDB replica set',
      );
    }
    client = await MongoClient.connect(uri);
    await ensurePersistenceIndexes(client.db(databaseName));
  });

  afterAll(async () => {
    if (client) {
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  });

  it('preserves already provisioned legacy watch indexes across repeated bootstraps', async () => {
    const legacyDb = client.db(databaseName + '_legacy_indexes');
    try {
      const watches = legacyDb.collection('telemetry_watch_state');
      await watches.createIndex(
        { id: 1 },
        { name: 'telemetry_watch_state_id_unique', unique: true },
      );
      await watches.createIndex(
        { protocol: 1, sourceIdentity: 1, scope: 1, targetId: 1 },
        { name: 'telemetry_watch_source_scope_target' },
      );
      await watches.createIndex(
        { lastObservedAt: 1 },
        { name: 'telemetry_watch_last_observed', sparse: true },
      );

      await ensurePersistenceIndexes(legacyDb);
      await ensurePersistenceIndexes(legacyDb);
      const indexes = await watches.indexes();
      expect(indexes.find((index) => index.name === 'telemetry_watch_state_id_unique')?.unique).toBe(
        true,
      );
      expect(indexes.some((index) => index.name === 'uq_telemetry_watch_state_id')).toBe(false);
      expect(indexes.some((index) => index.name === 'ix_telemetry_watch_source_scope_target')).toBe(
        false,
      );
      expect(indexes.some((index) => index.name === 'ix_telemetry_watch_last_observed')).toBe(
        false,
      );
    } finally {
      await legacyDb.dropDatabase();
    }
  });

  it('persists watch state and detects loss after restart without policies', async () => {
    const db = client.db(databaseName);
    const indexes = await db.collection('telemetry_watch_state').indexes();
    expect(indexes.find((index) => index.name === 'uq_telemetry_watch_state_id')?.unique).toBe(
      true,
    );

    const device: DeviceNode = {
      id: 'device',
      parentId: null as unknown as string,
      name: 'QDF-5',
      kind: 'DEVICE',
      pinned: false,
      serialNumber: SOURCE,
      deviceType: 'BDFB',
      rootEquipmentIds: [],
      lifecycle: 'ACTIVE',
      createdAt: at(-60_000),
      updatedAt: at(-60_000),
    };
    const topology = new MemoryTopologyRepository([device]);
    const binding: TelemetryBinding = {
      id: 'auto:mqtt:' + SOURCE,
      protocol: 'MQTT',
      sourceIdentity: SOURCE,
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId: device.id,
      lifecycle: 'ACTIVE',
      attributes: {
        discovery: 'UNIQUE_INVENTORY_SN',
        matchedNodeId: device.id,
      },
      createdAt: at(-60_000),
      updatedAt: at(-60_000),
    };
    const bindings = new MemoryTelemetryBindingRepository([binding]);
    const watches = new MongoTelemetryWatchRepository(db);
    const alarms = new MongoAlarmRepository(db);
    const policies = new MemoryAlarmPolicyRepository();

    expect(await db.collection('alarm_policies').countDocuments({})).toBe(0);

    const first = new TelemetryAlarmEvaluator(alarms, policies, topology, bindings, watches, {
      mode: 'ACTIVE',
      lossAfterMs: 1_000,
      recoverySamples: 2,
      reportedOfflineSamples: 2,
    });
    await first.observe(sourceSample(0));

    expect(await db.collection('telemetry_watch_state').countDocuments({})).toBe(1);
    expect(
      await db.collection('telemetry_watch_state').findOne({ sourceIdentity: SOURCE }),
    ).toMatchObject({
      scope: 'SOURCE',
      targetId: device.id,
      lastObservedAt: at(0),
    });

    const restarted = new TelemetryAlarmEvaluator(
      alarms,
      policies,
      topology,
      bindings,
      new MongoTelemetryWatchRepository(db),
      {
        mode: 'ACTIVE',
        lossAfterMs: 1_000,
        recoverySamples: 2,
        reportedOfflineSamples: 2,
      },
    );

    await restarted.evaluateNow(T0 + 1_500);

    const [active] = await alarms.listActive();
    expect(active).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: device.id,
      sourceContext: 'auto-watch:mqtt:' + SOURCE + ':source',
      lifecycle: 'ACTIVE',
    });

    await restarted.observe(sourceSample(1_600));
    await restarted.observe(sourceSample(1_700));
    await restarted.evaluateNow(T0 + 1_701);

    expect(await alarms.listActive()).toEqual([]);
    expect((await alarms.listResolved())[0]).toMatchObject({
      alarmCode: 'TELEMETRY_LOSS',
      targetId: device.id,
      lifecycle: 'RESOLVED',
    });
  });
});
