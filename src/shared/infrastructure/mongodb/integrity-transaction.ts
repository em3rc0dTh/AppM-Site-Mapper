import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientSession, Db } from 'mongodb';
import { getClient } from './client';

const context = new AsyncLocalStorage<ClientSession>();
export function integritySession(): ClientSession | undefined { return context.getStore(); }
export function integrityOptions(): { session: ClientSession } | Record<string, never> {
  const session = integritySession();
  return session ? { session } : {};
}

/** All canonical topology, power and binding writers share this fence. It prevents
 * snapshot-isolation write skew between archive and creation of a reference. */
export async function withIntegrityTransaction<T>(database: Db, work: (session: ClientSession) => Promise<T>): Promise<T> {
  const current = context.getStore();
  if (current) return work(current);
  const fences = database.collection('integrity_fences');
  try {
    await fences.updateOne({ key: 'canonical' }, { $setOnInsert: { key: 'canonical', revision: 0 } }, { upsert: true });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
  }
  const session = (await getClient()).startSession();
  try {
    return await session.withTransaction(async () => {
      const lock = await fences.updateOne({ key: 'canonical', maintenance: { $exists: false } }, { $inc: { revision: 1 } }, { session });
      if (lock.matchedCount !== 1) throw new IntegrityConflict('WRITES_PAUSED_FOR_MIGRATION');
      return context.run(session, () => work(session));
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
}

export class IntegrityConflict extends Error {
  constructor(readonly code: string) { super(code); }
}
