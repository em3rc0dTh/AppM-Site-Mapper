import {
  integrityOptions,
  withIntegrityTransaction,
} from '@/shared/infrastructure/mongodb/integrity-transaction';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';
import { randomUUID } from 'node:crypto';
export interface AdminAudit {
  id: string;
  actorId: string;
  action: string;
  targetId: string;
  at: string;
}
export async function recordAdminAudit(actorId: string, action: string, targetId: string) {
  const event: AdminAudit = {
    id: randomUUID(),
    actorId,
    action,
    targetId,
    at: new Date().toISOString(),
  };
  if (getPersistenceMode() === 'mongodb')
    await (
      await getMongoDatabase()
    )
      .collection<AdminAudit>('admin_audit')
      .insertOne(event, integrityOptions());
  else {
    const events = getProcessSingleton<AdminAudit[]>('admin-audit', () => []);
    events.push(event);
    if (events.length > 1000) events.shift();
  }
}

/** A successful mutation and its audit event commit together in MongoDB. */
export async function withAdminAudit<T>(
  actorId: string,
  action: string,
  targetId: string,
  work: () => Promise<T>,
): Promise<T> {
  const apply = async () => {
    const result = await work();
    await recordAdminAudit(actorId, action, targetId);
    return result;
  };
  if (getPersistenceMode() === 'mongodb')
    return withIntegrityTransaction(await getMongoDatabase(), apply);
  return apply();
}
