import { execFileSync } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { describe, expect, it } from 'vitest';

const enabled = process.env.CI_CHAOS_LOCAL_ONLY === 'true';
const uri = 'mongodb://127.0.0.1:27017/?replicaSet=rschaos';
const container = 'mk1-chaos-mongo';
const dbName = 'site_mapper_chaos_ci_' + process.env.GITHUB_RUN_ID;

function docker(...args: string[]) {
  return execFileSync('docker', args, { timeout: 20000 }).toString().trim();
}

async function connectAfterRestart(): Promise<MongoClient> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 35; attempt++) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 1800,
      connectTimeoutMS: 1800,
    });
    try {
      await client.connect();
      const hello = await client.db('admin').command({ hello: 1 });
      if (!hello.isWritablePrimary) throw new Error('Mongo replica set not writable');
      return client;
    } catch (error) {
      lastError = error;
      await client.close();
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
  }
  throw new Error('Mongo failed to recover: ' + String(lastError));
}

describe.skipIf(!enabled)('MK1 MongoDB fail-stop transaction chaos', () => {
  it('rolls back a transaction interrupted by mongod SIGKILL and accepts new atomic writes after recovery', async () => {
    if (!/^site_mapper_chaos_ci_[0-9]+$/.test(dbName))
      throw new Error('Unsafe MongoDB chaos database name');
    let client = await connectAfterRestart();
    let killed = false;
    const records = client.db(dbName).collection('chaos_atomic_records');
    const session = client.startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      await records.insertOne({ group: 'interrupted', part: 'A' }, { session });
      await records.insertOne({ group: 'interrupted', part: 'B' }, { session });

      // Kill the local disposable mongod before COMMIT. The two writes must
      // never become visible as partial committed business state.
      docker('kill', '--signal=SIGKILL', container);
      killed = true;
      await expect(session.commitTransaction()).rejects.toThrow();
    } finally {
      await session.endSession().catch(() => undefined);
      await client.close().catch(() => undefined);
      if (killed) docker('start', container);
    }

    client = await connectAfterRestart();
    try {
      const collection = client.db(dbName).collection('chaos_atomic_records');
      expect(await collection.countDocuments({ group: 'interrupted' })).toBe(0);

      const successful = client.startSession();
      try {
        await successful.withTransaction(async () => {
          await collection.insertOne({ group: 'recovered', part: 'A' }, { session: successful });
          await collection.insertOne({ group: 'recovered', part: 'B' }, { session: successful });
        });
      } finally {
        await successful.endSession();
      }
      expect(await collection.countDocuments({ group: 'recovered' })).toBe(2);
      console.log('[CHAOS PASS] Mongo SIGKILL transaction rollback and atomic recovery', {
        interrupted: 0,
        recovered: 2,
      });
    } finally {
      await client.close();
    }
  }, 110000);
});
