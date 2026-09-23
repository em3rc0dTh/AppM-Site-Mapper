#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

import { MongoClient } from 'mongodb';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function applyCanonicalMigration({ inputPath, uri, databaseName }) {
  const payload = JSON.parse(await readFile(inputPath, 'utf8'));

  if (!payload?.report || !Array.isArray(payload.records) || !payload.idMap) {
    throw new Error('Input is not a canonical migration output.');
  }

  if (payload.rejected?.length) {
    throw new Error('Refusing to apply a migration output that contains rejected records.');
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db(databaseName);
    const staging = database.collection('topology_nodes_migration_staging');

    await staging.deleteMany({ migrationFingerprint: payload.report.sourceFingerprint });

    if (payload.records.length > 0) {
      await staging.insertMany(
        payload.records.map((record) => ({
          ...record,
          migrationFingerprint: payload.report.sourceFingerprint,
        })),
      );
    }

    const stagedCount = await staging.countDocuments({
      migrationFingerprint: payload.report.sourceFingerprint,
    });

    if (stagedCount !== payload.records.length) {
      throw new Error(
        `Staging verification failed: expected ${payload.records.length}, found ${stagedCount}.`,
      );
    }

    return {
      migrationFingerprint: payload.report.sourceFingerprint,
      stagedCount,
      status: 'STAGED_VERIFIED',
    };
  } finally {
    await client.close();
  }
}

async function main(argv = process.argv.slice(2)) {
  const inputIndex = argv.indexOf('--input');

  if (inputIndex < 0 || !argv[inputIndex + 1]) {
    throw new Error('Usage: apply-mongo.mjs --input migration-output.json');
  }

  const result = await applyCanonicalMigration({
    inputPath: argv[inputIndex + 1],
    uri: requireEnv('MONGODB_URI'),
    databaseName: requireEnv('MONGODB_DB'),
  });

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(
    'Staging completed. Promotion to topology_nodes requires the documented verification/promotion step.\n',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
