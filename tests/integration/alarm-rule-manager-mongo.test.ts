import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';

import { DEFAULT_DC_PROFILE, type RuleDraftInput } from '@/modules/alarm/domain/rule-manager';
import { MongoRuleManagerStore } from '@/modules/alarm/infrastructure/rule-manager-store';
import { ensurePersistenceIndexes } from '@/shared/infrastructure/mongodb/bootstrap';

// This test can ONLY run against its own disposable loopback replica set.
const enabled = process.env.CI_ALARM_RULE_MANAGER === 'true';
const uri = process.env.MONGODB_URI ?? '';
const databaseName = 'site_mapper_rule_acceptance_' + process.pid + '_' + Date.now();

function draft(expectedRevision?: number, id?: string): RuleDraftInput {
  return {
    ...(id ? { id } : {}),
    ...(expectedRevision ? { expectedRevision } : {}),
    code: 'LOW_CURRENT',
    scope: 'GLOBAL',
    scopeId: null,
    electricalProfileId: DEFAULT_DC_PROFILE.id,
    parameters: { assertBelowA: 1.0, clearAboveA: 2.0 },
    severity: 'WARNING',
    debounceSamples: 2,
    recoverySamples: 2,
  };
}

describe.skipIf(!enabled)('Alarm Rule Manager — isolated real MongoDB acceptance', () => {
  let client: MongoClient;
  let db: Db;
  let store: MongoRuleManagerStore;

  beforeAll(async () => {
    if (
      process.env.APP_ENV !== 'test' ||
      !/^mongodb:\/\/127\.0\.0\.1:\d+\/\?replicaSet=[\w-]+$/.test(uri)
    ) {
      throw new Error('Rule Manager Mongo acceptance requires an isolated loopback test replica set');
    }
    client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 8_000 });
    db = client.db(databaseName);
    await ensurePersistenceIndexes(db);
    store = new MongoRuleManagerStore(db);
  });

  afterAll(async () => {
    if (client) {
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  });

  it('keeps published snapshots immutable while drafts change; retains audit across store instances', async () => {
    const first = await store.saveDraft(draft(), 'ci-admin');
    expect(first.revision).toBe(1);
    expect(first.published).toBeNull();

    const published = await store.changeStatus(first.id, first.revision, 'PUBLISH', 'ci-admin');
    expect(published.published?.parameters.assertBelowA).toBe(1.0);

    const updated = await store.saveDraft(
      { ...draft(published.revision, published.id), parameters: { assertBelowA: 1.5, clearAboveA: 2.5 } },
      'ci-admin',
    );
    expect(updated.draft.parameters.assertBelowA).toBe(1.5);
    expect(updated.published?.parameters.assertBelowA).toBe(1.0);

    const reopened = await new MongoRuleManagerStore(db).get(first.id);
    expect(reopened?.published?.parameters.assertBelowA).toBe(1.0);
    expect(reopened?.audit.map((event) => event.action)).toEqual([
      'CREATED', 'PUBLISHED', 'DRAFT_UPDATED',
    ]);
    expect(reopened?.audit.map((event) => event.revision)).toEqual([1, 2, 3]);
    expect(await db.collection('alarm_rule_configurations').countDocuments({ id: first.id })).toBe(1);
  });

  it('enforces compare-and-swap under concurrent publication and forbids stale mutation', async () => {
    const existing = (await store.list())[0]!;
    const results = await Promise.allSettled([
      store.changeStatus(existing.id, existing.revision, 'PUBLISH', 'ci-a'),
      store.changeStatus(existing.id, existing.revision, 'DISABLE', 'ci-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const winner = (await store.get(existing.id))!;
    expect(winner.revision).toBe(existing.revision + 1);
    expect(winner.audit).toHaveLength(existing.audit.length + 1);
    expect(winner.audit.at(-1)?.actorId).toMatch(/^ci-[ab]$/);
    await expect(store.saveDraft(draft(existing.revision, existing.id), 'ci-stale'))
      .rejects.toThrow('RULE_STALE_WRITE');
  });

  it('disables a rule without deleting its historical audit entries or affecting legacy alarm collections', async () => {
    const current = (await store.list())[0]!;
    const disabled = await store.changeStatus(current.id, current.revision, 'DISABLE', 'ci-admin');
    expect(disabled.published).toBeNull();
    expect(disabled.audit.at(-1)?.action).toBe('DISABLED');
    expect(disabled.audit).toHaveLength(5);
    expect(await db.collection('alarm_policies').countDocuments()).toBe(0);
    expect(await db.collection('alarm_occurrences').countDocuments()).toBe(0);
  });
});
