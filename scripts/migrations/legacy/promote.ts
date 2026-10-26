import { randomUUID } from 'node:crypto';
import {
  ensureTopologyIndexes,
  topologyValidator,
} from '../../../src/shared/infrastructure/mongodb/topology-schema.ts';
import { canonicalIntegrityErrors } from '../../../src/shared/infrastructure/mongodb/data-integrity-preflight.ts';
import { acquireMaintenance, releaseMaintenance } from '../maintenance.ts';
import process from 'node:process';

import { MongoClient, type Document } from 'mongodb';

import type { CanonicalNode } from './model.ts';
import { validatePromotionCandidate } from './promotion-validation.ts';

interface CliOptions {
  readonly fingerprint: string;
  readonly expected: number;
  readonly apply: boolean;
  readonly backupId?: string;
}

const STAGING = 'topology_nodes_migration_staging';
const LIVE = 'topology_nodes';
const CANDIDATE = 'topology_nodes_promotion_candidate_' + randomUUID().replaceAll('-', '');

function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    const candidate = index >= 0 ? argv[index + 1] : undefined;
    return candidate?.startsWith('--') ? undefined : candidate;
  };

  const fingerprint = value('--fingerprint')?.trim();
  const expectedRaw = value('--expected');
  const expected = Number(expectedRaw);

  if (
    !fingerprint ||
    !/^[a-fA-F0-9]{64}$/.test(fingerprint) ||
    !Number.isInteger(expected) ||
    expected < 1
  ) {
    throw new Error('Usage: --fingerprint <sha256> --expected <count> [--apply]');
  }

  if (value('--expect-db') !== process.env.MONGODB_DB_NAME || !process.env.MONGODB_DB_NAME?.trim())
    throw new Error('Matching --expect-db and explicit MONGODB_DB_NAME are required.');
  if (argv.includes('--apply') && (!argv.includes('--writers-stopped') || !value('--backup-id')))
    throw new Error(
      '--apply requires --writers-stopped and --backup-id. Stop all old application, industrial and external writers first.',
    );
  return {
    ...(value('--backup-id') ? { backupId: value('--backup-id')! } : {}),
    fingerprint,
    expected,
    apply: argv.includes('--apply'),
  };
}

function backupName(now = new Date()): string {
  const stamp = now.toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
  return `topology_nodes_backup_${stamp}`;
}

function canonicalDocument(document: Document): CanonicalNode {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  delete copy.migrationFingerprint;
  return copy as unknown as CanonicalNode;
}

async function collectionExists(
  client: MongoClient,
  databaseName: string,
  collectionName: string,
): Promise<boolean> {
  const db = client.db(databaseName);
  return Boolean(await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext());
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is required.');
  }

  const databaseName = process.env.MONGODB_DB_NAME!.trim();
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const database = client.db(databaseName);
    const owner = options.apply
      ? await acquireMaintenance(database, 'legacy-promotion', options.backupId!)
      : null;
    const staging = database.collection(STAGING);

    const stagedDocuments = await staging
      .find({ migrationFingerprint: options.fingerprint })
      .toArray();
    const nodes = stagedDocuments.map(canonicalDocument);
    const validation = validatePromotionCandidate(nodes);
    const paths = await database.collection('power_paths').find({}).toArray();
    const bindings = await database.collection('telemetry_bindings').find({}).toArray();
    const references = canonicalIntegrityErrors(nodes, paths, bindings);
    if (references.length)
      throw new Error(`PROMOTION_REFERENCES_BLOCKED: ${references.join(', ')}`);

    if (nodes.length !== options.expected) {
      throw new Error(
        `Promotion count mismatch: expected ${options.expected}, found ${nodes.length}.`,
      );
    }

    if (!validation.ok) {
      throw new Error(`Promotion validation failed: ${validation.errors.join(', ')}`);
    }

    if (!options.apply) {
      process.stdout.write(
        JSON.stringify(
          {
            mode: 'promotion-dry-run',
            database: databaseName,
            fingerprint: options.fingerprint,
            expected: options.expected,
            staged: nodes.length,
            countsByKind: validation.countsByKind,
            validation: 'PASS',
          },
          null,
          2,
        ) + '\n',
      );
      return;
    }

    // Unique candidate names preserve failed attempts for inspection; never drop data automatically.
    const candidate = await database.createCollection(CANDIDATE, {
      validator: topologyValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    await candidate.insertMany(nodes as Document[]);
    await ensureTopologyIndexes(candidate);

    const candidateNodes = (await candidate.find({}).toArray()).map(canonicalDocument);
    const candidateValidation = validatePromotionCandidate(candidateNodes);

    if (candidateNodes.length !== options.expected || !candidateValidation.ok) {
      throw new Error('Candidate verification failed before live swap.');
    }

    const finalReferences = canonicalIntegrityErrors(
      candidateNodes,
      await database.collection('power_paths').find({}).toArray(),
      await database.collection('telemetry_bindings').find({}).toArray(),
    );
    if (finalReferences.length)
      throw new Error('FINAL_PREFLIGHT_BLOCKED: ' + finalReferences.join(', '));
    const liveExists = await collectionExists(client, databaseName, LIVE);
    const backup = liveExists ? backupName() : null;

    const journalId = randomUUID();
    await database
      .collection('promotion_journal')
      .insertOne({
        id: journalId,
        candidate: CANDIDATE,
        backup,
        owner,
        fingerprint: options.fingerprint,
        phase: 'PREPARED',
        at: new Date(),
        backupId: options.backupId,
      });
    if (liveExists && backup) {
      await database.collection(LIVE).rename(backup);
      await database
        .collection('promotion_journal')
        .updateOne({ id: journalId }, { $set: { phase: 'LIVE_RENAMED' } });
    }

    try {
      await candidate.rename(LIVE);
      await database
        .collection('promotion_journal')
        .updateOne({ id: journalId }, { $set: { phase: 'CANDIDATE_PROMOTED' } });
    } catch (error) {
      if (
        backup &&
        (await collectionExists(client, databaseName, backup)) &&
        !(await collectionExists(client, databaseName, LIVE))
      ) {
        await database.collection(backup).rename(LIVE);
      }
      throw error;
    }

    const promoted = database.collection(LIVE);
    const promotedNodes = (await promoted.find({}).toArray()).map(canonicalDocument);
    const promotedValidation = validatePromotionCandidate(promotedNodes);

    if (promotedNodes.length !== options.expected || !promotedValidation.ok) {
      throw new Error(
        'Post-promotion verification failed. Live collection was not automatically rolled back; use the retained backup collection.',
      );
    }

    await database
      .collection('promotion_journal')
      .updateOne({ id: journalId }, { $set: { phase: 'COMPLETE' } });
    await releaseMaintenance(database, owner!);
    process.stdout.write(
      JSON.stringify(
        {
          mode: 'promotion-apply',
          database: databaseName,
          fingerprint: options.fingerprint,
          promoted: promotedNodes.length,
          countsByKind: promotedValidation.countsByKind,
          validation: 'PASS',
          backupCollection: backup,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await client.close();
  }
}

await main();
