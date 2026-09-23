import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import { MongoClient, type Document } from 'mongodb';

import type { LegacyMigrationInput, LegacyRecord, MigrationPlan } from './model.ts';
import { planLegacyMigration } from './transform.ts';

interface CliOptions {
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

const sourceAliases = {
  sites: ['Site', 'sites'],
  structures: ['Structure', 'structures'],
  levels: ['Level', 'levels'],
  rooms: ['Substructure', 'Room', 'rooms'],
  clusters: ['ContainerCluster', 'Bay', 'clusters'],
  positions: ['Position', 'positions'],
  containers: ['Container', 'Rack', 'containers'],
  devices: ['Device', 'devices'],
  equipment: ['Equipment', 'equipment'],
  shelves: ['Shelf', 'shelves'],
  frames: ['Frame', 'frames'],
  panels: ['Panel', 'panels'],
  breakers: ['Breaker', 'breakers'],
} as const;

interface CollectionResolution {
  readonly logicalName: string;
  readonly selected?: string;
  readonly candidates: readonly Readonly<{ name: string; documents: number }>[];
}

function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const idMap = value('--id-map');
  return {
    output: value('--output') ?? 'migration-report.json',
    ...(idMap ? { idMap } : {}),
    apply: argv.includes('--apply'),
  };
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (
    value &&
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  ) {
    return (value as { toHexString: () => string }).toHexString();
  }
  if (value && typeof value === 'object' && '$oid' in value) {
    const oid = (value as { $oid?: unknown }).$oid;
    return typeof oid === 'string' ? oid : null;
  }
  return null;
}

function recordId(record: LegacyRecord): string | null {
  return scalar(record.id) ?? scalar(record._id) ?? scalar(record.originalId);
}

function reference(record: LegacyRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = scalar(record[key]);
    if (value) return value;
  }
  return null;
}

function label(record: LegacyRecord, fallback: string): string {
  return (
    reference(record, ['label', 'name', 'title']) ?? reference(record, ['id', '_id']) ?? fallback
  );
}

function endpointVariant(record: LegacyRecord): 'BREAKER' | 'HOLDER' {
  const explicit = reference(record, ['variant', 'type', 'status'])?.toUpperCase();
  const endpointLabel = reference(record, ['label'])?.toUpperCase();
  if (explicit === 'HOLDER' || endpointLabel === 'HOLDER') return 'HOLDER';
  return 'BREAKER';
}

function numeric(record: LegacyRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function buildBdfb(
  device: LegacyRecord,
  shelves: readonly LegacyRecord[],
  frames: readonly LegacyRecord[],
  panels: readonly LegacyRecord[],
  breakers: readonly LegacyRecord[],
): Record<string, unknown> | undefined {
  const deviceIdentity = scalar(device._id) ?? recordId(device);
  if (!deviceIdentity) return undefined;

  const ownedShelves = shelves.filter(
    (shelf) => reference(shelf, ['deviceId', 'device_id']) === deviceIdentity,
  );
  if (ownedShelves.length === 0) return undefined;

  return {
    shelves: ownedShelves.map((shelf) => {
      const shelfIdentity = scalar(shelf._id) ?? recordId(shelf) ?? '';
      const ownedFrames = frames.filter(
        (frame) => reference(frame, ['shelfId', 'shelf_id']) === shelfIdentity,
      );
      return {
        id: recordId(shelf) ?? shelfIdentity,
        label: label(shelf, shelfIdentity),
        frames: ownedFrames.map((frame) => {
          const frameIdentity = scalar(frame._id) ?? recordId(frame) ?? '';
          const ownedPanels = panels.filter(
            (panel) => reference(panel, ['frameId', 'frame_id']) === frameIdentity,
          );
          return {
            id: recordId(frame) ?? frameIdentity,
            label: label(frame, frameIdentity),
            panels: ownedPanels.map((panel) => {
              const panelIdentity = scalar(panel._id) ?? recordId(panel) ?? '';
              const ownedBreakers = breakers.filter(
                (breaker) => reference(breaker, ['panelId', 'panel_id']) === panelIdentity,
              );
              return {
                id: recordId(panel) ?? panelIdentity,
                label: label(panel, panelIdentity),
                endpoints: ownedBreakers.map((breaker) => {
                  const breakerIdentity = recordId(breaker) ?? scalar(breaker._id) ?? '';
                  const capacity = numeric(breaker, ['capacity', 'ampacity', 'amps']);
                  return {
                    id: breakerIdentity,
                    variant: endpointVariant(breaker),
                    label: label(breaker, breakerIdentity),
                    ...(capacity === undefined ? {} : { capacity }),
                  };
                }),
              };
            }),
            ...(typeof frame.visible === 'boolean'
              ? { presentation: { physicalFrameVisible: frame.visible } }
              : {}),
          };
        }),
      };
    }),
  };
}

async function loadCollection(
  db: ReturnType<MongoClient['db']>,
  available: ReadonlySet<string>,
  logicalName: string,
  aliases: readonly string[],
): Promise<Readonly<{ records: readonly LegacyRecord[]; resolution: CollectionResolution }>> {
  const present = aliases.filter((name) => available.has(name));
  const candidates = await Promise.all(
    present.map(async (name) => ({
      name,
      documents: await db.collection(name).estimatedDocumentCount(),
    })),
  );

  const populated = candidates
    .filter((candidate) => candidate.documents > 0)
    .sort((left, right) => right.documents - left.documents);

  const selected = populated[0]?.name ?? candidates[0]?.name;

  if (
    populated.length > 1 &&
    populated[0] &&
    populated[1] &&
    populated[0].documents === populated[1].documents
  ) {
    throw new Error(
      `Ambiguous legacy source for ${logicalName}: ${populated
        .map((candidate) => `${candidate.name}(${candidate.documents})`)
        .join(', ')}. Resolve the duplicate populated collections before migration.`,
    );
  }

  const records = selected
    ? ((await db.collection(selected).find({}).toArray()) as readonly LegacyRecord[])
    : [];

  return {
    records,
    resolution: {
      logicalName,
      ...(selected ? { selected } : {}),
      candidates,
    },
  };
}

async function loadLegacyInput(client: MongoClient): Promise<LegacyMigrationInput> {
  const databaseName = process.env.LEGACY_MONGODB_DB_NAME?.trim();
  const networkId = process.env.LEGACY_NETWORK_ID?.trim();
  const networkName = process.env.LEGACY_NETWORK_NAME?.trim();

  if (!databaseName) throw new Error('LEGACY_MONGODB_DB_NAME is required.');
  if (!networkId) throw new Error('LEGACY_NETWORK_ID is required.');
  if (!networkName) throw new Error('LEGACY_NETWORK_NAME is required.');

  const db = client.db(databaseName);
  const available = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name),
  );

  const loadedEntries = await Promise.all(
    Object.entries(sourceAliases).map(async ([logicalName, aliases]) => [
      logicalName,
      await loadCollection(db, available, logicalName, aliases),
    ] as const),
  );
  const loaded = Object.fromEntries(
    loadedEntries.map(([logicalName, result]) => [logicalName, result.records]),
  ) as Record<keyof typeof sourceAliases, readonly LegacyRecord[]>;
  const resolutions = loadedEntries.map(([, result]) => result.resolution);

  process.stdout.write(
    JSON.stringify(
      {
        collectionResolution: resolutions,
      },
      null,
      2,
    ) + '\n',
  );

  const enrichedDevices = loaded.devices.map((device) => {
    const bdfb = buildBdfb(device, loaded.shelves, loaded.frames, loaded.panels, loaded.breakers);
    return bdfb ? { ...device, bdfb } : device;
  });

  return {
    network: { id: networkId, name: networkName },
    collections: {
      sites: loaded.sites,
      structures: loaded.structures,
      levels: loaded.levels,
      rooms: loaded.rooms,
      clusters: loaded.clusters,
      positions: loaded.positions,
      containers: loaded.containers,
      devices: enrichedDevices,
      equipment: loaded.equipment,
    },
  };
}

async function stagePlan(plan: MigrationPlan): Promise<StageResult> {
  if (plan.rejections.length > 0) {
    throw new Error('Refusing apply: migration plan contains rejected records.');
  }

  const targetUri = process.env.MONGODB_URI?.trim();
  const targetDb = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
  const sourceUri = process.env.LEGACY_MONGODB_URI?.trim();
  const sourceDb = process.env.LEGACY_MONGODB_DB_NAME?.trim();

  if (!targetUri) throw new Error('MONGODB_URI is required for --apply.');
  if (targetUri === sourceUri && targetDb === sourceDb) {
    throw new Error('Refusing apply: legacy source and MK1 target database are identical.');
  }

  const collectionName = 'topology_nodes_migration_staging';
  const client = new MongoClient(targetUri);
  try {
    await client.connect();
    const collection = client.db(targetDb).collection(collectionName);
    await collection.deleteMany({ migrationFingerprint: plan.sourceFingerprint });

    if (plan.nodes.length > 0) {
      await collection.insertMany(
        plan.nodes.map((node) => ({
          ...node,
          migrationFingerprint: plan.sourceFingerprint,
        })) as Document[],
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
  const sourceUri = process.env.LEGACY_MONGODB_URI?.trim();
  if (!sourceUri) throw new Error('LEGACY_MONGODB_URI is required.');

  const sourceClient = new MongoClient(sourceUri);
  let input: LegacyMigrationInput;
  try {
    await sourceClient.connect();
    input = await loadLegacyInput(sourceClient);
  } finally {
    await sourceClient.close();
  }

  if (options.idMap) {
    input = {
      ...input,
      idMap: JSON.parse(await readFile(options.idMap, 'utf8')) as Record<string, string>,
    };
  }

  const plan = planLegacyMigration(input);
  await writeFile(options.output, JSON.stringify(plan, null, 2) + '\n', 'utf8');

  let staging: StageResult | undefined;
  if (options.apply) {
    if (!options.idMap) {
      throw new Error(
        'Refusing apply without --id-map. Run dry-run first and persist the reviewed idMap.',
      );
    }
    staging = await stagePlan(plan);
  }

  process.stdout.write(
    JSON.stringify(
      {
        mode: options.apply ? 'staging-apply' : 'dry-run',
        sourceDatabase: process.env.LEGACY_MONGODB_DB_NAME,
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

  if (plan.rejections.length > 0) process.exitCode = 2;
}

await main();
