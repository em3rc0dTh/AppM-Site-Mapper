#!/usr/bin/env node
/**
 * Explicit, non-destructive laboratory restore of the operator's PRIVATE
 * seed-01 EJSON snapshot. NOT a production migration and NOT a general import.
 *
 * This script refuses an existing database, refuses normal DB names, and
 * requires a typed target confirmation. Never publish the snapshot JSON.
 *
 * Example:
 * node scripts/seed-01-restore-lab.mjs \
 *   --snapshot ./seed-01-topology-full.json \
 *   --uri 'mongodb://127.0.0.1:27017/?directConnection=true' \
 *   --database seed-01-restore-lab \
 *   --confirm seed-01-restore-lab
 */
import { readFile } from 'node:fs/promises';
import { MongoClient, EJSON } from 'mongodb';

function parseArgs(argv) {
  const options = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1])
      throw new Error('Usage: --snapshot FILE --uri URI --database LAB_DB --confirm LAB_DB');
    options.set(argv[i].slice(2), argv[i + 1]);
  }
  for (const key of ['snapshot', 'uri', 'database', 'confirm']) {
    if (!options.get(key)) throw new Error('Missing --' + key);
  }
  return options;
}

function validateReference(data) {
  if (
    data.database !== 'seed-01' ||
    !Array.isArray(data.topology) ||
    !Array.isArray(data.seedState) ||
    data.seedState.length !== 1 ||
    data.seedState[0]._id !== 'seed-01' ||
    data.seedState[0].version !== 4 ||
    data.topology.length !== 115
  ) {
    throw new Error('Snapshot is not the reviewed operator seed-01 v4, 115-node export');
  }
  const byId = new Map();
  for (const node of data.topology) {
    if (!node.id || byId.has(node.id) || !node.kind || !node.name)
      throw new Error('Duplicate/missing topology identity or kind');
    byId.set(node.id, node);
  }
  const roots = data.topology.filter((node) => !node.parentId);
  if (roots.length !== 1 || roots[0].kind !== 'NETWORK')
    throw new Error('Snapshot must have exactly one NETWORK root');
  for (const node of data.topology) {
    if (node.parentId && !byId.has(node.parentId)) throw new Error('Dangling parentId ' + node.id);
    if (node.kind === 'EQUIPMENT') {
      if (!byId.has(node.deviceId)) throw new Error('Missing Equipment device ' + node.id);
      if (node.parentEquipmentId && !byId.has(node.parentEquipmentId))
        throw new Error('Missing parent Equipment ' + node.id);
      for (const child of node.children ?? []) {
        if (child && !byId.has(child)) throw new Error('Missing positional child ' + child);
      }
    }
  }
  const archived = data.topology.filter((n) => n.lifecycle === 'ARCHIVED');
  if (
    archived.length !== 7 ||
    archived.filter((n) => n.kind === 'ROOM_SUBSTRUCTURE').length !== 1 ||
    archived.filter((n) => n.kind === 'EQUIPMENT' && ['A1', 'B1'].includes(n.name)).length !== 6
  )
    throw new Error('Historical room/panel tombstones do not match reviewed snapshot');
  const devices = data.topology.filter((n) => n.kind === 'DEVICE');
  if (devices.length !== 3 || devices.some((n) => n.deviceType !== 'BDFB'))
    throw new Error('BDFB inventory differs from reviewed snapshot');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbName = options.get('database');
  if (
    !/^seed-01-(restore|parity|check)-lab(?:-[a-z0-9-]+)?$/.test(dbName) ||
    options.get('confirm') !== dbName
  ) {
    throw new Error('Destination must be explicitly confirmed seed-01-restore-lab name');
  }
  const source = EJSON.parse(await readFile(options.get('snapshot'), 'utf8'));
  validateReference(source);
  const client = new MongoClient(options.get('uri'), { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    // Require the entire destination database to be empty, not just topology_nodes.
    // This prevents overwriting sessions, telemetry, users or any operator data.
    const database = client.db(dbName);
    if ((await database.listCollections({}, { nameOnly: true }).toArray()).length !== 0)
      throw new Error('DESTINATION_NOT_EMPTY: refusing to import');
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          if ((await database.listCollections({}, { nameOnly: true, session }).toArray()).length)
            throw new Error('DESTINATION_NOT_EMPTY inside transaction');
          await database
            .collection('topology_nodes')
            .insertMany(source.topology, { session, ordered: true });
          await database.collection('runtime_seed_state').insertMany(source.seedState, { session });
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
    console.log(
      'LAB_RESTORE_OK:',
      dbName,
      'nodes:',
      source.topology.length,
      'seed version:',
      source.seedState[0].version,
    );
    console.log('Next: run read-only scripts/seed-01-parity.mjs --exact-ids before applying v6.');
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error('LAB_RESTORE_FAILED:', error.message);
  process.exitCode = 1;
});
