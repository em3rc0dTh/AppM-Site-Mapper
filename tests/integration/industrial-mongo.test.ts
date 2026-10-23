import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { MongoObservationStore } from '@/modules/telemetry/infrastructure/industrial/store';
import {
  normalizeObservations,
  type SourceProfile,
} from '@/modules/telemetry/domain/industrial/observations';
const uri = process.env.INDUSTRIAL_TEST_MONGO_URI;
const profile: SourceProfile = {
  sourceIdentity: 'EMU-CONCURRENT',
  protocol: 'MQTT',
  version: 'test-1',
  staleMs: 30000,
  rules: [{ key: '/v', kind: 'measurement', unit: 'V', scale: 1 }],
};
describe.skipIf(!uri)('industrial real Mongo replica set', () => {
  let client: MongoClient, store: MongoObservationStore;
  const database = 'industrial_test_' + Date.now();
  beforeAll(async () => {
    client = await MongoClient.connect(uri!);
    store = new MongoObservationStore(client.db(database), client);
    await store.initialize();
  });
  afterAll(async () => {
    await client?.db(database).dropDatabase();
    await client?.close();
  });
  const batch = (i: number) =>
    normalizeObservations(
      {
        protocol: 'MQTT',
        sourceIdentity: profile.sourceIdentity,
        topic: 'data/dev/EMU-CONCURRENT',
        transport: 'publish',
        receivedAt: new Date(Date.now() + i).toISOString(),
        observedAt: new Date(Date.now() + i).toISOString(),
        messageId: `packet-${i}`,
        raw: { v: i, unknown: { typed: true } },
      },
      profile,
    );
  it('atomically preserves concurrent originals/history and recovers latest on a new store instance', async () => {
    const batches = Array.from({ length: 12 }, (_, i) => batch(i));
    await Promise.all(batches.map((b) => store.commit(b)));
    expect(await client.db(database).collection('industrial_events').countDocuments()).toBe(12);
    expect(await client.db(database).collection('industrial_signal_history').countDocuments()).toBe(
      24,
    );
    const recovered = new MongoObservationStore(client.db(database), client);
    const signals = await recovered.list();
    expect(signals.find((s) => s.key === '/v')?.value).toBe(11);
    expect(await store.commit(batches[0]!)).toBe('duplicate');
    expect(await store.event(batches[0]!.id)).toEqual(batches[0]!.envelope);
    expect(await client.db(database).collection('industrial_events').countDocuments()).toBe(12);
  }, 20000);
  it('rolls back a conflicting message as a whole and retains the prior latest state', async () => {
    const b = batch(100);
    await store.commit(b);
    const altered = { ...b, envelope: { ...b.envelope, raw: { v: -999 } } };
    await expect(store.commit(altered)).rejects.toThrow('conflict');
    expect((await store.list()).find((s) => s.key === '/v')?.value).toBe(100);
    expect(
      await client.db(database).collection('industrial_events').countDocuments({ eventId: b.id }),
    ).toBe(1);
  });
});
