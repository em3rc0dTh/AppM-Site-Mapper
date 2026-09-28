import process from 'node:process';

import { MongoClient, type Collection, type Document } from 'mongodb';

import type { CanonicalNode } from './model.ts';
import { validatePromotionCandidate } from './promotion-validation.ts';

interface CliOptions {
  readonly fingerprint: string;
  readonly expected: number;
  readonly apply: boolean;
}

const STAGING = 'topology_nodes_migration_staging';
const LIVE = 'topology_nodes';
const CANDIDATE = 'topology_nodes_promotion_candidate';

function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const fingerprint = value('--fingerprint')?.trim();
  const expectedRaw = value('--expected');
  const expected = Number(expectedRaw);

  if (!fingerprint || !Number.isInteger(expected) || expected < 1) {
    throw new Error(
      'Usage: --fingerprint <sha256> --expected <count> [--apply]',
    );
  }

  return {
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

async function ensureTopologyIndexes(collection: Collection<Document>): Promise<void> {
  await Promise.all([
    collection.createIndex({ id: 1 }, { unique: true, name: 'uq_topology_id' }),
    collection.createIndex(
      { parentId: 1, lifecycle: 1, name: 1 },
      { name: 'ix_topology_parent_lifecycle_name' },
    ),
    collection.createIndex(
      { kind: 1, lifecycle: 1 },
      { name: 'ix_topology_kind_lifecycle' },
    ),
    collection.createIndex(
      { serialNumber: 1 },
      { name: 'ix_topology_serial', sparse: true },
    ),
  ]);
}

async function collectionExists(
  client: MongoClient,
  databaseName: string,
  collectionName: string,
): Promise<boolean> {
  const db = client.db(databaseName);
  return Boolean(
    await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext(),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is required.');
  }

  const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const database = client.db(databaseName);
    const staging = database.collection(STAGING);

    const stagedDocuments = await staging
      .find({ migrationFingerprint: options.fingerprint })
      .toArray();
    const nodes = stagedDocuments.map(canonicalDocument);
    const validation = validatePromotionCandidate(nodes);

    if (nodes.length !== options.expected) {
      throw new Error(
        `Promotion count mismatch: expected ${options.expected}, found ${nodes.length}.`,
      );
    }

    if (!validation.ok) {
      throw new Error(
        `Promotion validation failed: ${validation.errors.join(', ')}`,
      );
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

    if (await collectionExists(client, databaseName, CANDIDATE)) {
      await database.collection(CANDIDATE).drop();
    }

    const candidate = database.collection(CANDIDATE);
    await candidate.insertMany(nodes as Document[]);
    await ensureTopologyIndexes(candidate);

    const candidateNodes = (await candidate.find({}).toArray()).map(canonicalDocument);
    const candidateValidation = validatePromotionCandidate(candidateNodes);

    if (
      candidateNodes.length !== options.expected ||
      !candidateValidation.ok
    ) {
      await candidate.drop();
      throw new Error('Candidate verification failed before live swap.');
    }

    const liveExists = await collectionExists(client, databaseName, LIVE);
    const backup = liveExists ? backupName() : null;

    if (liveExists && backup) {
      await database.collection(LIVE).rename(backup);
    }

    try {
      await candidate.rename(LIVE);
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

    if (
      promotedNodes.length !== options.expected ||
      !promotedValidation.ok
    ) {
      throw new Error(
        'Post-promotion verification failed. Live collection was not automatically rolled back; use the retained backup collection.',
      );
    }

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
