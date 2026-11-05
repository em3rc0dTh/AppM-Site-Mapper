import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';

import { BreakerLimitService } from '@/modules/power/application/breaker-limit-service';
import { parseBreakerProtectionInput } from '@/modules/power/domain/breaker-protection';
import { getClient } from '@/shared/infrastructure/mongodb/client';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';

const enabled = process.env.CI_BREAKER_ACCEPTANCE === 'true';
const databaseName = `site_mapper_s01_ci_${process.pid}_${Date.now()}`;
const timestamp = '2026-11-05T00:00:00.000Z';
const input = (revision = 1) =>
  parseBreakerProtectionInput({
    ratedCurrentA: 20,
    assertAboveA: 20,
    clearBelowA: 18,
    provenance: { source: 'PROVISIONAL_STANDARD', verified: false },
    expectedRevision: revision,
  });

describe.skipIf(!enabled)('S01 real Mongo replica-set transactions', () => {
  let db: Db;
  let service: BreakerLimitService;
  beforeAll(async () => {
    const uri = process.env.MONGODB_URI ?? '';
    // Only a disposable loopback replica set. Never use TFARM or a customer database.
    if (
      !/^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[\w-]+$/.test(uri) ||
      process.env.APP_ENV !== 'test'
    ) {
      throw new Error('S01 acceptance requires an isolated local test replica set');
    }
    db = (await getClient()).db(databaseName);
    await ensurePersistenceIndexes(db);
    service = new BreakerLimitService(db);
  });
  beforeEach(async () => {
    for (const name of [
      'topology_nodes',
      'telemetry_bindings',
      'alarm_policies',
      'breaker_limit_events',
    ]) {
      await db.collection(name).deleteMany({});
    }
    await db.collection('topology_nodes').insertMany([
      {
        id: 'bdfb',
        kind: 'DEVICE',
        deviceType: 'BDFB',
        name: 'Synthetic BDFB',
        parentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lifecycle: 'ACTIVE',
      },
      {
        id: 'panel',
        kind: 'EQUIPMENT',
        equipmentType: 'PANEL',
        deviceId: 'bdfb',
        name: 'A1',
        parentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        children: ['breaker', 'sibling'],
        lifecycle: 'ACTIVE',
      },
      ...['breaker', 'sibling'].map((id) => ({
        id,
        kind: 'EQUIPMENT',
        equipmentType: 'CIRCUIT_BREAKER',
        deviceId: 'bdfb',
        parentEquipmentId: 'panel',
        name: id,
        parentId: null,
        createdAt: timestamp,
        lifecycle: 'ACTIVE',
        revision: 1,
        updatedAt: timestamp,
        attributes: {},
      })),
    ]);
    await db.collection('telemetry_bindings').insertOne({
      id: 'current',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      protocol: 'MQTT',
      metric: 'CURRENT',
      lifecycle: 'ACTIVE',
      sourceIdentity: 'S01-SYNTHETIC',
      sourcePointId: '0_1_1',
    });
  });
  afterAll(async () => {
    if (db) await db.dropDatabase();
    if (db) await (await getClient()).close();
  });

  it('persists settings, policy and audit through a new service while preserving the sibling', async () => {
    const sibling = await db.collection('topology_nodes').findOne({ id: 'sibling' });
    await service.update('breaker', input(), 'synthetic-admin');
    const fresh = new BreakerLimitService(db);
    expect(await fresh.get('breaker')).toMatchObject({
      revision: 2,
      protection: { ratedCurrentA: 20 },
      policy: { assertAboveA: 20, clearBelowA: 18 },
    });
    expect(await fresh.history('breaker')).toMatchObject([
      { actorId: 'synthetic-admin', before: null, after: { ratedCurrentA: 20 } },
    ]);
    expect(await db.collection('topology_nodes').findOne({ id: 'sibling' })).toEqual(sibling);
  });

  it('allows exactly one concurrent revision and produces one audit event', async () => {
    const result = await Promise.allSettled([
      service.update('breaker', input(), 'admin-a'),
      service.update('breaker', input(), 'admin-b'),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const failure = result.find((item) => item.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason.message).toBe('BREAKER_STALE_WRITE');
    expect(
      await db.collection('breaker_limit_events').countDocuments({ breakerId: 'breaker' }),
    ).toBe(1);
    expect((await service.get('breaker')).revision).toBe(2);
  });

  it('rolls back Equipment and policy if the database rejects the audit insert', async () => {
    const before = await service.get('breaker');
    // Real server-side validation failure, not a mock of transaction behavior.
    await db.command({
      collMod: 'breaker_limit_events',
      validator: { rejectAllS01Events: { $exists: true } },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    try {
      await expect(service.update('breaker', input(), 'synthetic-admin')).rejects.toThrow();
      expect(await service.get('breaker')).toEqual(before);
      expect(await db.collection('alarm_policies').countDocuments({ targetId: 'breaker' })).toBe(0);
      expect(await service.history('breaker')).toHaveLength(0);
    } finally {
      await db.command({
        collMod: 'breaker_limit_events',
        validator: {},
        validationLevel: 'strict',
      });
    }
  });

  it('preserves disabled policy, debounce/recovery, and previous thresholds in the audit', async () => {
    await db.collection('alarm_policies').insertOne({
      id: 'existing',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 's01',
      sourceIdentity: 'S01-SYNTHETIC',
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      overcurrent: {
        assertAboveA: 30,
        clearBelowA: 25,
        debounceSamples: 3,
        recoverySamples: 4,
        severity: 'WARNING',
      },
    });
    await service.update('breaker', input(), 'synthetic-admin');
    expect(await service.get('breaker')).toMatchObject({
      policyEnabled: false,
      policy: { assertAboveA: 20, debounceSamples: 3, recoverySamples: 4 },
    });
    expect(await service.history('breaker')).toMatchObject([
      { beforePolicy: { assertAboveA: 30, clearBelowA: 25 } },
    ]);
  });

  it('protects a verified rating and rejects a stale revision without additional audit', async () => {
    const verified = parseBreakerProtectionInput({
      ...input(),
      provenance: { source: 'MANUFACTURER', verified: true, reference: 'SYNTHETIC-EVIDENCE' },
      verificationConfirmed: true,
    });
    await service.update('breaker', verified, 'synthetic-admin');
    await expect(service.update('breaker', input(2), 'synthetic-admin')).rejects.toThrow(
      'VERIFIED_RATING_DOWNGRADE_FORBIDDEN',
    );
    await expect(service.update('breaker', input(1), 'synthetic-admin')).rejects.toThrow(
      'BREAKER_STALE_WRITE',
    );
    expect(await service.history('breaker')).toHaveLength(1);
  });
});
