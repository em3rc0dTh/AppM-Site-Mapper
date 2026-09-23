import process from 'node:process';

import { MongoClient, type Collection, type Document } from 'mongodb';

interface CliOptions {
  readonly fingerprint: string;
  readonly expected: number;
  readonly confirmFingerprint: string;
}

interface StagedNode extends Document {
  readonly id?: unknown;
  readonly parentId?: unknown;
  readonly kind?: unknown;
  readonly migrationFingerprint?: unknown;
}

const expectedParentKind: Readonly<Record<string, string>> = {
  SITE: 'NETWORK',
  STRUCTURE: 'SITE',
  LEVEL: 'STRUCTURE',
  ROOM_SUBSTRUCTURE: 'LEVEL',
  CONTAINER_CLUSTER_BAY: 'ROOM_SUBSTRUCTURE',
  POSITION: 'CONTAINER_CLUSTER_BAY',
  CONTAINER_RACK: 'POSITION',
  DEVICE: 'CONTAINER_RACK',
  EQUIPMENT: 'CONTAINER_RACK',
};

function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const fingerprint = value('--fingerprint')?.trim();
  const confirmFingerprint = value('--confirm-fingerprint')?.trim();
  const expectedRaw = value('--expected');
  const expected = expectedRaw ? Number(expectedRaw) : Number.NaN;

  if (!fingerprint) throw new Error('--fingerprint is required.');
  if (!confirmFingerprint) throw new Error('--confirm-fingerprint is required.');
  if (confirmFingerprint !== fingerprint) {
    throw new Error('--confirm-fingerprint must exactly match --fingerprint.');
  }
  if (!Number.isInteger(expected) || expected < 1) {
    throw new Error('--expected must be a positive integer.');
  }

  return { fingerprint, expected, confirmFingerprint };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function backupSuffix(): string {
  return new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
}

function canonicalDocument(node: StagedNode): Document {
  const copy = { ...node } as Record<string, unknown>;
  delete copy._id;
  delete copy.migrationFingerprint;
  return copy;
}

function validateCanonicalSet(nodes: readonly StagedNode[]): readonly string[] {
  const issues: string[] = [];
  const byId = new Map<string, StagedNode>();
  let networkCount = 0;

  for (const node of nodes) {
    const id = stringValue(node.id);
    const kind = stringValue(node.kind);
    if (!id) {
      issues.push('A staged node is missing a canonical id.');
      continue;
    }
    if (byId.has(id)) issues.push(`Duplicate canonical id: ${id}.`);
    byId.set(id, node);

    if (kind === 'NETWORK') networkCount += 1;
    if (kind !== 'NETWORK' && !expectedParentKind[kind ?? '']) {
      issues.push(`${id}: unsupported kind ${String(node.kind)}.`);
    }
  }

  if (networkCount !== 1) {
    issues.push(`Expected exactly one NETWORK; found ${networkCount}.`);
  }

  for (const node of nodes) {
    const id = stringValue(node.id);
    const kind = stringValue(node.kind);
    if (!id || !kind) continue;

    if (kind === 'NETWORK') {
      if (node.parentId !== null) issues.push(`${id}: NETWORK parentId must be null.`);
      continue;
    }

    const parentId = stringValue(node.parentId);
    if (!parentId) {
      issues.push(`${id}: ${kind} is missing parentId.`);
      continue;
    }

    const parent = byId.get(parentId);
    if (!parent) {
      issues.push(`${id}: parent ${parentId} is missing from candidate set.`);
      continue;
    }

    const expectedKind = expectedParentKind[kind];
    if (parent.kind !== expectedKind) {
      issues.push(`${id}: expected parent kind ${expectedKind}, found ${String(parent.kind)}.`);
    }
  }

  return issues;
}

async function ensureTopologyIndexes(collection: Collection<Document>): Promise<void> {
  await Promise.all([
    collection.createIndex({ id: 1 }, { unique: true, name: 'uq_topology_id' }),
    collection.createIndex(
      { parentId: 1, lifecycle: 1, name: 1 },
      { name: 'ix_topology_parent_lifecycle_name' },
    ),
    collection.createIndex({ kind: 1, lifecycle: 1 }, { name: 'ix_topology_kind_lifecycle' }),
    collection.createIndex({ serialNumber: 1 }, { name: 'ix_topology_serial', sparse: true }),
  ]);
}

async function collectionExists(
  database: ReturnType<MongoClient['db']>,
  name: string,
): Promise<boolean> {
  return (await database.listCollections({ name }, { nameOnly: true }).toArray()).length === 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
  const legacyDatabaseName = process.env.LEGACY_MONGODB_DB_NAME?.trim();

  if (!uri) throw new Error('MONGODB_URI is required.');
  if (legacyDatabaseName && legacyDatabaseName === databaseName) {
    throw new Error('Refusing promotion: MK1 target database matches the legacy source database.');
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const database = client.db(databaseName);
    const staging = database.collection<StagedNode>('topology_nodes_migration_staging');
    const staged = await staging.find({ migrationFingerprint: options.fingerprint }).toArray();

    if (staged.length !== options.expected) {
      throw new Error(
        `Refusing promotion: expected ${options.expected} staged nodes, found ${staged.length}.`,
      );
    }

    const issues = validateCanonicalSet(staged);
    if (issues.length > 0) {
      throw new Error(`Refusing promotion: candidate validation failed:\n- ${issues.join('\n- ')}`);
    }

    const candidateName = `topology_nodes_migration_candidate_${options.fingerprint.slice(0, 12)}`;
    if (await collectionExists(database, candidateName)) {
      await database.collection(candidateName).drop();
    }

    const candidate = database.collection<Document>(candidateName);
    await candidate.insertMany(staged.map(canonicalDocument));
    await ensureTopologyIndexes(candidate);

    const candidateCount = await candidate.countDocuments({});
    if (candidateCount !== options.expected) {
      throw new Error(
        `Candidate verification failed: expected ${options.expected}, found ${candidateCount}.`,
      );
    }

    const liveName = 'topology_nodes';
    const liveExists = await collectionExists(database, liveName);
    const backupName = liveExists
      ? `topology_nodes_migration_backup_${backupSuffix()}_${options.fingerprint.slice(0, 8)}`
      : null;

    if (backupName && (await collectionExists(database, backupName))) {
      throw new Error(`Refusing promotion: backup collection already exists: ${backupName}.`);
    }

    if (backupName) {
      await database.collection(liveName).rename(backupName, { dropTarget: false });
    }

    try {
      await candidate.rename(liveName, { dropTarget: false });
    } catch (error) {
      if (backupName && (await collectionExists(database, backupName))) {
        await database.collection(backupName).rename(liveName, { dropTarget: false });
      }
      throw error;
    }

    const live = database.collection<Document>(liveName);
    const liveCount = await live.countDocuments({});
    if (liveCount !== options.expected) {
      throw new Error(
        `Post-promotion verification failed: expected ${options.expected}, found ${liveCount}.`,
      );
    }

    process.stdout.write(
      JSON.stringify(
        {
          mode: 'promoted',
          database: databaseName,
          fingerprint: options.fingerprint,
          staged: staged.length,
          liveCollection: liveName,
          liveCount,
          backupCollection: backupName,
          stagingPreserved: true,
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
