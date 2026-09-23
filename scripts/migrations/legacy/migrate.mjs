#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const COLLECTION_ALIASES = Object.freeze({
  Network: 'NETWORK',
  network: 'NETWORK',
  networks: 'NETWORK',
  Site: 'SITE',
  site: 'SITE',
  sites: 'SITE',
  Structure: 'STRUCTURE',
  structure: 'STRUCTURE',
  structures: 'STRUCTURE',
  Level: 'LEVEL',
  level: 'LEVEL',
  levels: 'LEVEL',
  Room: 'ROOM_SUBSTRUCTURE',
  room: 'ROOM_SUBSTRUCTURE',
  rooms: 'ROOM_SUBSTRUCTURE',
  Substructure: 'ROOM_SUBSTRUCTURE',
  substructure: 'ROOM_SUBSTRUCTURE',
  substructures: 'ROOM_SUBSTRUCTURE',
  Cluster: 'CONTAINER_CLUSTER_BAY',
  cluster: 'CONTAINER_CLUSTER_BAY',
  clusters: 'CONTAINER_CLUSTER_BAY',
  ContainerCluster: 'CONTAINER_CLUSTER_BAY',
  containerCluster: 'CONTAINER_CLUSTER_BAY',
  containerClusters: 'CONTAINER_CLUSTER_BAY',
  Bay: 'CONTAINER_CLUSTER_BAY',
  bay: 'CONTAINER_CLUSTER_BAY',
  bays: 'CONTAINER_CLUSTER_BAY',
  Position: 'POSITION',
  position: 'POSITION',
  positions: 'POSITION',
  Container: 'CONTAINER_RACK',
  container: 'CONTAINER_RACK',
  containers: 'CONTAINER_RACK',
  Rack: 'CONTAINER_RACK',
  rack: 'CONTAINER_RACK',
  racks: 'CONTAINER_RACK',
  Device: 'DEVICE',
  device: 'DEVICE',
  devices: 'DEVICE',
  Equipment: 'EQUIPMENT',
  equipment: 'EQUIPMENT',
});

const PARENT_KINDS = Object.freeze({
  NETWORK: null,
  SITE: 'NETWORK',
  STRUCTURE: 'SITE',
  LEVEL: 'STRUCTURE',
  ROOM_SUBSTRUCTURE: 'LEVEL',
  CONTAINER_CLUSTER_BAY: 'ROOM_SUBSTRUCTURE',
  POSITION: 'CONTAINER_CLUSTER_BAY',
  CONTAINER_RACK: 'POSITION',
  DEVICE: 'CONTAINER_RACK',
  EQUIPMENT: 'CONTAINER_RACK',
});

function legacyId(record) {
  const value = record.id ?? record._id ?? record.legacyId ?? record.uuid;
  return value == null ? null : String(value);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return '';
}

function parentLegacyId(record) {
  const value =
    record.parentId ??
    record.parent_id ??
    record.networkId ??
    record.siteId ??
    record.structureId ??
    record.levelId ??
    record.roomId ??
    record.substructureId ??
    record.clusterId ??
    record.containerClusterId ??
    record.bayId ??
    record.positionId ??
    record.containerId ??
    record.rackId;

  return value == null ? null : String(value);
}

function normalizeVariant(kind, collection, record) {
  if (kind === 'ROOM_SUBSTRUCTURE') {
    const explicit = String(record.variant ?? '').toUpperCase();
    if (explicit === 'ROOM' || explicit === 'SUBSTRUCTURE') return explicit;
    return /substructure/i.test(collection) ? 'SUBSTRUCTURE' : 'ROOM';
  }

  if (kind === 'CONTAINER_CLUSTER_BAY') {
    const explicit = String(record.variant ?? '').toUpperCase();
    if (explicit === 'CONTAINER_CLUSTER' || explicit === 'BAY') return explicit;
    return /bay/i.test(collection) ? 'BAY' : 'CONTAINER_CLUSTER';
  }

  if (kind === 'CONTAINER_RACK') {
    const explicit = String(record.variant ?? '').toUpperCase();
    if (explicit === 'CONTAINER' || explicit === 'RACK') return explicit;
    const totalU = Number(record.totalU ?? record.total_u ?? record.rackUnits ?? 0);
    return /rack/i.test(collection) || totalU > 0 ? 'RACK' : 'CONTAINER';
  }

  return undefined;
}

function parseCoordinate(record) {
  const rawRow = record.coordinate?.row ?? record.row ?? record.gridRow;
  const rawColumn = record.coordinate?.column ?? record.column ?? record.gridColumn;
  const row = text(rawRow).toUpperCase();
  const column = Number(rawColumn);

  if (row && Number.isInteger(column) && column > 0) {
    return { row, column };
  }

  const label = firstText(record.gridCoordinate, record.coordinateLabel, record.position);
  const match = /^([A-Za-z]+)[-_ ]?(\d+)$/.exec(label);
  if (!match) return null;

  return { row: match[1].toUpperCase(), column: Number(match[2]) };
}

function normalizePolygon(record) {
  const raw = record.polygon ?? record.points;
  if (!Array.isArray(raw)) return undefined;

  const points = raw
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const x = Number(point.x);
      const y = Number(point.y);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter(Boolean);

  return points.length >= 3 ? points : undefined;
}

function normalizeCas(record, idFactory) {
  const totalU = Number(record.totalU ?? record.total_u ?? record.rackUnits ?? 0);
  if (!Number.isInteger(totalU) || totalU < 1) return [];

  return [
    {
      id: idFactory(),
      startU: 1,
      endU: totalU,
      state: 'AVAILABLE',
    },
  ];
}

export function buildLegacyFingerprint(bundle) {
  return createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
}

export function migrateLegacyBundle(bundle, options = {}) {
  const idFactory = options.idFactory ?? randomUUID;
  const migratedAt = options.timestamp ?? new Date().toISOString();
  const existingIdMap = new Map(Object.entries(options.idMap ?? {}));
  const idMap = new Map(existingIdMap);
  const records = [];
  const rejected = [];

  if (!bundle || typeof bundle !== 'object' || !bundle.collections || typeof bundle.collections !== 'object') {
    throw new Error('Legacy bundle must contain a collections object.');
  }

  const staged = [];

  for (const [collection, items] of Object.entries(bundle.collections)) {
    if (!Array.isArray(items)) {
      rejected.push({ collection, reason: 'COLLECTION_NOT_ARRAY' });
      continue;
    }

    const kind = COLLECTION_ALIASES[collection];
    if (!kind) {
      rejected.push({ collection, reason: 'UNSUPPORTED_COLLECTION', count: items.length });
      continue;
    }

    for (const record of items) {
      if (!record || typeof record !== 'object') {
        rejected.push({ collection, reason: 'INVALID_RECORD' });
        continue;
      }

      const sourceId = legacyId(record);
      const name = firstText(record.name, record.label, record.title, record.code);

      if (!sourceId) {
        rejected.push({ collection, reason: 'MISSING_LEGACY_ID' });
        continue;
      }

      if (!name) {
        rejected.push({ collection, legacyId: sourceId, reason: 'MISSING_NAME' });
        continue;
      }

      if (!idMap.has(sourceId)) {
        idMap.set(sourceId, idFactory());
      }

      staged.push({ collection, kind, sourceId, name, record });
    }
  }

  const byLegacyId = new Map(staged.map((entry) => [entry.sourceId, entry]));

  for (const entry of staged) {
    const expectedParentKind = PARENT_KINDS[entry.kind];
    const sourceParentId = expectedParentKind === null ? null : parentLegacyId(entry.record);
    const parentEntry = sourceParentId ? byLegacyId.get(sourceParentId) : null;

    if (expectedParentKind !== null) {
      if (!sourceParentId) {
        rejected.push({
          collection: entry.collection,
          legacyId: entry.sourceId,
          reason: 'MISSING_PARENT',
          expectedParentKind,
        });
        continue;
      }

      if (!parentEntry || parentEntry.kind !== expectedParentKind) {
        rejected.push({
          collection: entry.collection,
          legacyId: entry.sourceId,
          parentLegacyId: sourceParentId,
          reason: 'INVALID_PARENT',
          expectedParentKind,
          actualParentKind: parentEntry?.kind ?? null,
        });
        continue;
      }
    }

    const base = {
      id: idMap.get(entry.sourceId),
      legacyId: entry.sourceId,
      parentId: sourceParentId ? idMap.get(sourceParentId) : null,
      name: entry.name,
      kind: entry.kind,
      lifecycle: 'ACTIVE',
      createdAt: migratedAt,
      updatedAt: migratedAt,
    };

    let node = base;

    if (entry.kind === 'ROOM_SUBSTRUCTURE') {
      node = {
        ...base,
        variant: normalizeVariant(entry.kind, entry.collection, entry.record),
        ...(normalizePolygon(entry.record) ? { polygon: normalizePolygon(entry.record) } : {}),
      };
    } else if (entry.kind === 'CONTAINER_CLUSTER_BAY') {
      node = {
        ...base,
        variant: normalizeVariant(entry.kind, entry.collection, entry.record),
      };
    } else if (entry.kind === 'POSITION') {
      const coordinate = parseCoordinate(entry.record);
      if (!coordinate) {
        rejected.push({
          collection: entry.collection,
          legacyId: entry.sourceId,
          reason: 'INVALID_COORDINATE',
        });
        continue;
      }
      node = { ...base, coordinate };
    } else if (entry.kind === 'CONTAINER_RACK') {
      const variant = normalizeVariant(entry.kind, entry.collection, entry.record);
      const totalU = Number(entry.record.totalU ?? entry.record.total_u ?? entry.record.rackUnits ?? 0);
      node = {
        ...base,
        variant,
        ...(Number.isInteger(totalU) && totalU > 0 ? { totalU } : {}),
        cas: variant === 'RACK' ? normalizeCas(entry.record, idFactory) : [],
      };
    } else if (entry.kind === 'DEVICE' || entry.kind === 'EQUIPMENT') {
      node = {
        ...base,
        pinned: Boolean(entry.record.pinned ?? entry.record.isPinned ?? false),
        ...(firstText(entry.record.serialNumber, entry.record.serial, entry.record.sn)
          ? { serialNumber: firstText(entry.record.serialNumber, entry.record.serial, entry.record.sn) }
          : {}),
        ...(firstText(entry.record.category, entry.record.type)
          ? { category: firstText(entry.record.category, entry.record.type) }
          : {}),
      };
    }

    records.push(node);
  }

  const report = {
    sourceFingerprint: buildLegacyFingerprint(bundle),
    migratedAt,
    totalSourceRecords: Object.values(bundle.collections)
      .filter(Array.isArray)
      .reduce((sum, items) => sum + items.length, 0),
    acceptedRecords: records.length,
    rejectedRecords: rejected.length,
    byKind: Object.fromEntries(
      Object.keys(PARENT_KINDS).map((kind) => [
        kind,
        records.filter((record) => record.kind === kind).length,
      ]),
    ),
  };

  return {
    records,
    rejected,
    idMap: Object.fromEntries(idMap),
    report,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const inputIndex = argv.indexOf('--input');
  const outputIndex = argv.indexOf('--output');
  const idMapIndex = argv.indexOf('--id-map');
  const apply = argv.includes('--apply');

  if (inputIndex < 0 || !argv[inputIndex + 1]) {
    throw new Error('Usage: migrate.mjs --input legacy.json [--output canonical.json] [--id-map id-map.json] [--apply]');
  }

  const inputPath = argv[inputIndex + 1];
  const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : 'migration-output.json';
  const idMapPath = idMapIndex >= 0 ? argv[idMapIndex + 1] : 'migration-id-map.json';
  const bundle = JSON.parse(await readFile(inputPath, 'utf8'));

  let existingIdMap = {};
  try {
    existingIdMap = JSON.parse(await readFile(idMapPath, 'utf8'));
  } catch {
    // First run: the mapping ledger will be created.
  }

  const result = migrateLegacyBundle(bundle, { idMap: existingIdMap });

  await writeFile(outputPath, JSON.stringify(result, null, 2));
  await writeFile(idMapPath, JSON.stringify(result.idMap, null, 2));

  const mode = apply ? 'APPLY_REQUESTED' : 'DRY_RUN';
  process.stdout.write(
    JSON.stringify(
      {
        mode,
        outputPath,
        idMapPath,
        report: result.report,
        rejected: result.rejected,
      },
      null,
      2,
    ) + '\n',
  );

  if (apply) {
    process.stderr.write(
      'Apply mode validates and materializes canonical output only. Database writes are intentionally performed by the controlled apply script.\n',
    );
  }

  if (result.rejected.length > 0) {
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
