import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { MongoClient } from 'mongodb';

import type { LegacyMigrationInput, MigrationPlan } from './model.ts';
import { planLegacyMigration } from './transform.ts';

interface CliOptions {
  readonly input: string;
  readonly output: string;
  readonly idMap?: string;
  readonly apply: boolean;
}

interface StageResult {
  readonly collection: string;
  readonly fingerprint: string;
  readonly expected: number;
  readonly staged: number;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const input = value('--input');
  if (!input) {
    throw new Error(
      'Usage: --input <legacy.json> [--output report.json] [--id-map ids.json] [--apply]',
    );
  }

  const idMap = value('--id-map');

  return {
    input,
    output: value('--output') ?? 'migration-report.json',
    ...(idMap ? { idMap } : {}),
    apply: argv.includes('--apply'),
  };
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function writePlan(plan: MigrationPlan, output: string): Promise<void> {
  await writeFile(output, JSON.stringify(plan, null, 2) + '\n', 'utf8');
}

async function stagePlan(plan: MigrationPlan): Promise<StageResult> {
  if (plan.rejections.length > 0) {
    throw new Error('Refusing apply: migration plan contains rejected records.');
  }

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error('MONGODB_URI is required for --apply.');
  }

  const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
  const collectionName = 'topology_nodes_migration_staging';
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    const collection = client.db(databaseName).collection(collectionName);

    await collection.deleteMany({ migrationFingerprint: plan.sourceFingerprint });

    if (plan.nodes.length > 0) {
      await collection.insertMany(
        plan.nodes.map((node) => ({
          ...node,
          migrationFingerprint: plan.sourceFingerprint,
        })),
      );
    }

    const staged = await collection.countDocuments({
      migrationFingerprint: plan.sourceFingerprint,
    });

    if (staged !== plan.nodes.length) {
      throw new Error(
        `Staging verification failed: expected ${plan.nodes.length}, found ${staged}.`,
      );
    }

    return {
      collection: collectionName,
      fingerprint: plan.sourceFingerprint,
      expected: plan.nodes.length,
      staged,
    };
  } finally {
    await client.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rawInput = await loadJson<LegacyMigrationInput>(options.input);
  const input: LegacyMigrationInput = options.idMap
    ? { ...rawInput, idMap: await loadJson<Record<string, string>>(options.idMap) }
    : rawInput;

  const plan = planLegacyMigration(input);
  await writePlan(plan, options.output);

  let staging: StageResult | undefined;

  if (options.apply) {
    if (!options.idMap) {
      throw new Error(
        'Refusing apply without --id-map. Persist the dry-run idMap and reuse it for deterministic reruns.',
      );
    }

    staging = await stagePlan(plan);
  }

  process.stdout.write(
    JSON.stringify(
      {
        mode: options.apply ? 'staging-apply' : 'dry-run',
        output: options.output,
        sourceFingerprint: plan.sourceFingerprint,
        counts: plan.counts,
        warnings: plan.warnings.length,
        rejections: plan.rejections.length,
        ...(staging ? { staging } : {}),
      },
      null,
      2,
    ) + '\n',
  );

  if (plan.rejections.length > 0) {
    process.exitCode = 2;
  }
}

await main();
