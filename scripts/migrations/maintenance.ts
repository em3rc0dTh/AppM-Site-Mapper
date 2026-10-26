import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';

export async function acquireMaintenance(database: Db, operation: string, backupId: string): Promise<string> {
  const fences = database.collection('integrity_fences');
  await fences.createIndex({ key: 1 }, { unique: true, name: 'uq_integrity_fence_key' });
  await fences.updateOne({ key: 'canonical' }, { $setOnInsert: { key: 'canonical', revision: 0 } }, { upsert: true });
  const owner = randomUUID();
  const locked = await fences.findOneAndUpdate({ key: 'canonical', maintenance: { $exists: false } }, {
    $inc: { revision: 1 }, $set: { maintenance: { owner, operation, backupId, startedAt: new Date() } },
  }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
  if (!locked) throw new Error('MAINTENANCE_ALREADY_ACTIVE');
  process.stdout.write(JSON.stringify({ maintenanceOwner: owner, operation, backupId }) + '\n');
  return owner;
}

export async function releaseMaintenance(database: Db, owner: string): Promise<void> {
  const released = await database.collection('integrity_fences').updateOne({ key: 'canonical', 'maintenance.owner': owner }, {
    $unset: { maintenance: '' }, $inc: { revision: 1 },
  }, { writeConcern: { w: 'majority' } });
  if (released.matchedCount !== 1) throw new Error('MAINTENANCE_OWNER_CHANGED');
}
