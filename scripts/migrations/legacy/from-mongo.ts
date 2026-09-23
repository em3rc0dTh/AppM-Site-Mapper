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
  sites: { pascal: ['Site'], lowercase: ['sites'] },
  structures: { pascal: ['Structure'], lowercase: ['structures'] },
  levels: { pascal: ['Level'], lowercase: ['levels'] },
  rooms: { pascal: ['Substructure', 'Room'], lowercase: ['rooms'] },
  clusters: { pascal: ['ContainerCluster', 'Bay'], lowercase: ['clusters'] },
  positions: { pascal: ['Position'], lowercase: ['positions'] },
  containers: { pascal: ['Container', 'Rack'], lowercase: ['containers'] },
  devices: { pascal: ['Device'], lowercase: ['devices'] },
  equipment: { pascal: ['Equipment'], lowercase: ['equipment'] },
  shelves: { pascal: ['Shelf'], lowercase: ['shelves'] },
  frames: { pascal: ['Frame'], lowercase: ['frames'] },
  panels: { pascal: ['Panel'], lowercase: ['panels'] },
  breakers: { pascal: ['Breaker'], lowercase: ['breakers'] },
} as const;

type CollectionFamily = 'pascal' | 'lowercase';

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

async function collectionCount(
  db: ReturnType<MongoClient['db']>,
  available: ReadonlySet<string>,
  names: readonly string[],
): Promise<number> {
  let total = 0;
  for (const name of names) {
    if (available.has(name)) total += await db.collection(name).estimatedDocumentCount();
  }
  return total;
}

async function detectCollectionFamily(
  db: ReturnType<MongoClient['db']>,
  available: ReadonlySet<string>,
): Promise<CollectionFamily> {
  const requested = process.env.LEGACY_COLLECTION_FAMILY?.trim().toLowerCase();
  if (requested === 'pascal' || requested === 'lowercase') return requested;

  const logicalNames = [
    'structures',
    'levels',
    'rooms',
    'clusters',
    'containers',
    'devices',
  ] as const;
  let pascal = 0;
  let lowercase = 0;
  for (const logicalName of logicalNames) {
    pascal += await collectionCount(db, available, sourceAliases[logicalName].pascal);
    lowercase += await collectionCount(db, available, sourceAliases[logicalName].lowercase);
  }

  if (pascal === lowercase && pascal > 0) {
    throw new Error(
      'Could not determine legacy collection family automatically. Set LEGACY_COLLECTION_FAMILY=pascal or lowercase.',
    );
  }
  return pascal >= lowercase ? 'pascal' : 'lowercase';
}

function asRecord(value: unknown): LegacyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LegacyRecord)
    : null;
}

function embeddedBdfb(device: LegacyRecord): Record<string, unknown> | undefined {
  if (!Array.isArray(device.shelves) || device.shelves.length === 0) return undefined;

  const shelves = device.shelves.flatMap((rawShelf, shelfIndex) => {
    const shelf = asRecord(rawShelf);
    if (!shelf) return [];
    const shelfId = recordId(shelf) ?? `embedded-shelf-${shelfIndex + 1}`;
    const frames = Array.isArray(shelf.frames)
      ? shelf.frames.flatMap((rawFrame, frameIndex) => {
          const frame = asRecord(rawFrame);
          if (!frame) return [];
          const frameId = recordId(frame) ?? `${shelfId}-frame-${frameIndex + 1}`;
          const panels = Array.isArray(frame.panels)
            ? frame.panels.flatMap((rawPanel, panelIndex) => {
                const panel = asRecord(rawPanel);
                if (!panel) return [];
                const panelId = recordId(panel) ?? `${frameId}-panel-${panelIndex + 1}`;
                const rawEndpoints = [
                  ...(Array.isArray(panel.breakers) ? panel.breakers : []),
                  ...(Array.isArray(panel.holders) ? panel.holders : []),
                ];
                const endpoints = rawEndpoints.flatMap((rawEndpoint, endpointIndex) => {
                  const endpoint = asRecord(rawEndpoint);
                  if (!endpoint) return [];
                  const assignedBreaker = asRecord(endpoint.breaker);
                  const endpointId =
                    recordId(endpoint) ??
                    recordId(assignedBreaker ?? {}) ??
                    `${panelId}-endpoint-${endpointIndex + 1}`;
                  const capacity =
                    numeric(assignedBreaker ?? {}, ['capacity', 'ampacity', 'amps']) ??
                    numeric(endpoint, ['capacity', 'ampacity', 'amps']);
                  const explicitStatus = reference(endpoint, [
                    'status',
                    'variant',
                    'type',
                  ])?.toUpperCase();
                  const variant =
                    assignedBreaker || explicitStatus === 'BREAKER' ? 'BREAKER' : 'HOLDER';
                  return [
                    {
                      id: endpointId,
                      variant,
                      label: label(assignedBreaker ?? endpoint, `Endpoint ${endpointIndex + 1}`),
                      ...(capacity === undefined ? {} : { capacity }),
                    },
                  ];
                });
                return [
                  {
                    id: panelId,
                    label: label(panel, `Panel ${panelIndex + 1}`),
                    endpoints,
                  },
                ];
              })
            : [];
          return [
            {
              id: frameId,
              label: label(frame, `Frame ${frameIndex + 1}`),
              panels,
              ...(typeof frame.visible === 'boolean'
                ? { presentation: { physicalFrameVisible: frame.visible } }
                : {}),
            },
          ];
        })
      : [];
    return [
      {
        id: shelfId,
        label: label(shelf, `Shelf ${shelfIndex + 1}`),
        frames,
      },
    ];
  });

  return shelves.length ? { shelves } : undefined;
}

function coordinateFromRecord(
  record: LegacyRecord,
): Readonly<{ row: string; column: number }> | null {
  const appMObject = asRecord(record.appMObject);
  const source = Array.isArray(record.grid_coordinate)
    ? record.grid_coordinate
    : appMObject && Array.isArray(appMObject.grid_coordinate)
      ? appMObject.grid_coordinate
      : null;
  const coordinate = source?.map((value) => scalar(value)).find(Boolean);
  const match = coordinate?.match(/^([A-Za-z]+)[- ]?(\d+)$/);
  return match ? { row: match[1]!.toUpperCase(), column: Number(match[2]) } : null;
}

function inferClusterRow(cluster: LegacyRecord | undefined): string {
  if (!cluster) return 'A';
  const clusterLabel = reference(cluster, ['label', 'name']) ?? '';
  const match = clusterLabel.match(/\b(?:row|bay)\s*[-:]?\s*([A-Z]+)\b/i);
  return match?.[1]?.toUpperCase() ?? 'A';
}

function deriveDirectContainerPositions(
  loaded: Record<keyof typeof sourceAliases, readonly LegacyRecord[]>,
): Record<keyof typeof sourceAliases, readonly LegacyRecord[]> {
  const clusterById = new Map(
    loaded.clusters.flatMap((cluster) => {
      const id = recordId(cluster);
      return id ? [[id, cluster] as const] : [];
    }),
  );
  const positionIds = new Set(
    loaded.positions.flatMap((position) => {
      const id = recordId(position);
      return id ? [id] : [];
    }),
  );
  const derivedPositions: LegacyRecord[] = [];
  const clusterCounters = new Map<string, number>();

  const containers = loaded.containers.map((container) => {
    const parent = reference(container, ['positionId', 'position_id', 'parentId']);
    if (!parent || positionIds.has(parent) || !clusterById.has(parent)) return container;

    const containerId = recordId(container);
    if (!containerId) return container;
    const derivedId = `derived-position:${containerId}`;
    const cluster = clusterById.get(parent);
    const next = (clusterCounters.get(parent) ?? 0) + 1;
    clusterCounters.set(parent, next);

    const realCoordinate = coordinateFromRecord(container);
    const explicitPosition = numeric(container, ['position']);
    const column =
      realCoordinate?.column ??
      (explicitPosition && Number.isInteger(explicitPosition) && explicitPosition > 0
        ? explicitPosition
        : next);
    const row = realCoordinate?.row ?? inferClusterRow(cluster);
    derivedPositions.push({
      id: derivedId,
      name: `Position ${row}-${column}`,
      label: `Position ${row}-${column}`,
      parentId: parent,
      row,
      column,
      migrationDerived: true,
      migrationCoordinateSource: realCoordinate
        ? 'container.grid_coordinate'
        : explicitPosition
          ? 'container.position'
          : 'cluster-order-fallback',
    });
    return { ...container, parentId: derivedId };
  });

  return {
    ...loaded,
    positions: [...loaded.positions, ...derivedPositions],
    containers,
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

  const family = await detectCollectionFamily(db, available);
  const loadedEntries = await Promise.all(
    Object.entries(sourceAliases).map(
      async ([logicalName, families]) =>
        [
          logicalName,
          await loadCollection(
            db,
            available,
            logicalName,
            families[family as keyof typeof families],
          ),
        ] as const,
    ),
  );
  const loadedRaw = Object.fromEntries(
    loadedEntries.map(([logicalName, result]) => [logicalName, result.records]),
  ) as Record<keyof typeof sourceAliases, readonly LegacyRecord[]>;
  const loaded = deriveDirectContainerPositions(loadedRaw);
  const resolutions = loadedEntries.map(([, result]) => result.resolution);

  process.stdout.write(
    JSON.stringify(
      {
        collectionFamily: family,
        collectionResolution: resolutions,
        derivedPositions: loaded.positions.length - loadedRaw.positions.length,
      },
      null,
      2,
    ) + '\n',
  );

  const enrichedDevices = loaded.devices.map((device) => {
    const bdfb =
      embeddedBdfb(device) ??
      buildBdfb(device, loaded.shelves, loaded.frames, loaded.panels, loaded.breakers);
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

  const rejectionReasons = Object.entries(
    plan.rejections.reduce<Record<string, number>>((summary, rejection) => {
      summary[rejection.reason] = (summary[rejection.reason] ?? 0) + 1;
      return summary;
    }, {}),
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);

  const sourceCollections = Object.entries(input.collections);

  const rejectionDetails = plan.rejections.map((rejection) => {
    const source = input.collections[rejection.sourceCollection] ?? [];
    const record = rejection.legacyId
      ? source.find((candidate) => recordId(candidate) === rejection.legacyId)
      : undefined;
    const unresolvedParent = rejection.reason.startsWith('UNRESOLVED_PARENT:')
      ? rejection.reason.split(':').at(-1)
      : null;
    const parentMatches = unresolvedParent
      ? sourceCollections.flatMap(([collectionName, records]) =>
          records
            .filter((candidate) => recordId(candidate) === unresolvedParent)
            .map((candidate) => ({
              collection: collectionName,
              legacyId: recordId(candidate),
              name: label(candidate, unresolvedParent),
            })),
        )
      : [];

    return {
      ...rejection,
      ...(parentMatches.length ? { parentMatches } : {}),
      ...(record
        ? {
            name: label(record, rejection.legacyId ?? 'Unnamed'),
            category: reference(record, ['category', 'type', 'variant']),
            parentReferences: {
              parentId: reference(record, ['parentId']),
              siteId: reference(record, ['siteId', 'site_id']),
              structureId: reference(record, ['structureId', 'structure_id']),
              levelId: reference(record, ['levelId', 'level_id']),
              roomId: reference(record, ['roomId', 'room_id', 'substructureId']),
              clusterId: reference(record, ['clusterId', 'containerClusterId']),
              positionId: reference(record, ['positionId', 'position_id']),
              containerId: reference(record, ['containerId', 'rackId']),
            },
            rackFacts: {
              totalU: numeric(record, ['totalU', 'totalUnits', 'rackUnits', 'uHeight']),
              capacityTotal: asRecord(record.capacity)
                ? numeric(record.capacity as LegacyRecord, ['total'])
                : undefined,
              heightRu:
                (asRecord(record.dimensions)
                  ? numeric(record.dimensions as LegacyRecord, ['heightRu'])
                  : undefined) ??
                (asRecord(record.appMObject)
                  ? numeric(record.appMObject as LegacyRecord, ['heightRu'])
                  : undefined),
              casEntries: Array.isArray(record.CAS)
                ? record.CAS.length
                : Array.isArray(record.cas)
                  ? record.cas.length
                  : 0,
            },
            sourceShape: {
              keys: Object.keys(record).sort(),
              appMObjectKeys: asRecord(record.appMObject)
                ? Object.keys(record.appMObject as LegacyRecord).sort()
                : [],
              dimensionsKeys: asRecord(record.dimensions)
                ? Object.keys(record.dimensions as LegacyRecord).sort()
                : [],
              capacityKeys: asRecord(record.capacity)
                ? Object.keys(record.capacity as LegacyRecord).sort()
                : [],
            },
          }
        : {}),
    };
  });

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
        rejectionReasons,
        rejectionDetails,
        ...(staging ? { staging } : {}),
      },
      null,
      2,
    ) + '\n',
  );

  if (plan.rejections.length > 0) process.exitCode = 2;
}

await main();
