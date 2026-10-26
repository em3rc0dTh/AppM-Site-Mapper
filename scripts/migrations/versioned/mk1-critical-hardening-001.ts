import { MongoClient } from 'mongodb';
import { canonicalIntegrityErrors } from '../../../src/shared/infrastructure/mongodb/data-integrity-preflight.ts';
import {
  ensureTopologyIndexes,
  topologyValidator,
  HARDENING_SCHEMA_VERSION,
} from '../../../src/shared/infrastructure/mongodb/topology-schema.ts';
import { acquireMaintenance, releaseMaintenance } from '../maintenance.ts';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  return value?.startsWith('--') ? undefined : value;
};
const apply = args.includes('--apply');
const databaseName = process.env.MONGODB_DB_NAME?.trim();
if (!databaseName || !process.env.MONGODB_URI || option('--expect-db') !== databaseName)
  throw new Error('Explicit MONGODB_URI, MONGODB_DB_NAME and matching --expect-db are required.');
if (apply && (!args.includes('--writers-stopped') || !option('--backup-id')))
  throw new Error('--apply requires --writers-stopped and --backup-id from a recoverable backup.');
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const database = client.db(databaseName);
  const owner = apply
    ? await acquireMaintenance(database, HARDENING_SCHEMA_VERSION, option('--backup-id')!)
    : null;
  const nodes = await database.collection('topology_nodes').find({}).toArray();
  const paths = await database.collection('power_paths').find({}).toArray();
  const bindings = await database.collection('telemetry_bindings').find({}).toArray();
  const errors = canonicalIntegrityErrors(nodes, paths, bindings);
  process.stdout.write(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'preflight',
        version: HARDENING_SCHEMA_VERSION,
        database: databaseName,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  if (errors.length)
    throw new Error(
      'PREFLIGHT_BLOCKED: no data repaired; if apply acquired maintenance, keep writers stopped until reviewed.',
    );
  if (apply) {
    await ensureTopologyIndexes(database.collection('topology_nodes'));
    await database.command({
      collMod: 'topology_nodes',
      validator: topologyValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    await database
      .collection('identity_initialization')
      .createIndex({ key: 1 }, { unique: true, name: 'uq_identity_initialization_key' });
    await database
      .collection('schema_migrations')
      .updateOne(
        { version: HARDENING_SCHEMA_VERSION },
        { $set: { appliedAt: new Date(), backupId: option('--backup-id') } },
        { upsert: true },
      );
    await releaseMaintenance(database, owner!);
  }
} finally {
  await client.close();
}
