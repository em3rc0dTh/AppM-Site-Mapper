import { randomUUID } from 'node:crypto';

import type {
  CanonicalKind,
  CanonicalNode,
  LegacyMigrationInput,
  LegacyRecord,
  MigrationPlan,
  MigrationRejection,
  MigrationWarning,
} from './model.ts';
import { migrationKey } from './model.ts';

interface SourceSpec {
  readonly collection: string;
  readonly kind: CanonicalKind;
  readonly variant?: string;
}

const sourceSpecs: readonly SourceSpec[] = [
  { collection: 'Site', kind: 'SITE' },
  { collection: 'sites', kind: 'SITE' },
  { collection: 'Structure', kind: 'STRUCTURE' },
  { collection: 'structures', kind: 'STRUCTURE' },
  { collection: 'Level', kind: 'LEVEL' },
  { collection: 'levels', kind: 'LEVEL' },
  { collection: 'Room', kind: 'ROOM_SUBSTRUCTURE', variant: 'ROOM' },
  { collection: 'Substructure', kind: 'ROOM_SUBSTRUCTURE', variant: 'SUBSTRUCTURE' },
  { collection: 'rooms', kind: 'ROOM_SUBSTRUCTURE', variant: 'SUBSTRUCTURE' },
  {
    collection: 'ContainerCluster',
    kind: 'CONTAINER_CLUSTER_BAY',
    variant: 'CONTAINER_CLUSTER',
  },
  { collection: 'clusters', kind: 'CONTAINER_CLUSTER_BAY', variant: 'CONTAINER_CLUSTER' },
  { collection: 'Bay', kind: 'CONTAINER_CLUSTER_BAY', variant: 'BAY' },
  { collection: 'bays', kind: 'CONTAINER_CLUSTER_BAY', variant: 'BAY' },
  { collection: 'Position', kind: 'POSITION' },
  { collection: 'positions', kind: 'POSITION' },
  { collection: 'Container', kind: 'CONTAINER_RACK' },
  { collection: 'containers', kind: 'CONTAINER_RACK' },
  { collection: 'Rack', kind: 'CONTAINER_RACK', variant: 'RACK' },
  { collection: 'racks', kind: 'CONTAINER_RACK', variant: 'RACK' },
  { collection: 'Device', kind: 'DEVICE' },
  { collection: 'devices', kind: 'DEVICE' },
  { collection: 'Equipment', kind: 'EQUIPMENT' },
  { collection: 'equipment', kind: 'EQUIPMENT' },
];

const order: Readonly<Record<CanonicalKind, number>> = {
  NETWORK: 0,
  SITE: 1,
  STRUCTURE: 2,
  LEVEL: 3,
  ROOM_SUBSTRUCTURE: 4,
  CONTAINER_CLUSTER_BAY: 5,
  POSITION: 6,
  CONTAINER_RACK: 7,
  DEVICE: 8,
  EQUIPMENT: 8,
};

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === 'object' && '$oid' in value) {
    const oid = (value as { $oid?: unknown }).$oid;
    return typeof oid === 'string' && oid.trim() ? oid.trim() : null;
  }

  return null;
}

function getString(record: LegacyRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = scalar(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function getNumber(record: LegacyRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function legacyId(record: LegacyRecord): string | null {
  return getString(record, ['id', '_id', 'legacyId']);
}

function nameOf(record: LegacyRecord): string | null {
  return getString(record, ['name', 'Name', 'label', 'title']);
}

function parentLegacyId(kind: CanonicalKind, record: LegacyRecord): string | null {
  switch (kind) {
    case 'SITE':
      return '__NETWORK__';
    case 'STRUCTURE':
      return getString(record, ['siteId', 'site_id', 'site']);
    case 'LEVEL':
      return getString(record, ['structureId', 'structure_id', 'structure']);
    case 'ROOM_SUBSTRUCTURE':
      return getString(record, ['levelId', 'level_id', 'level']);
    case 'CONTAINER_CLUSTER_BAY':
      return getString(record, [
        'roomId',
        'substructureId',
        'room_id',
        'substructure_id',
        'parentId',
      ]);
    case 'POSITION':
      return getString(record, [
        'containerClusterId',
        'clusterId',
        'bayId',
        'container_cluster_id',
        'cluster_id',
        'bay_id',
        'parentId',
      ]);
    case 'CONTAINER_RACK':
      return getString(record, ['positionId', 'position_id', 'position', 'parentId']);
    case 'DEVICE':
    case 'EQUIPMENT':
      return getString(record, ['containerId', 'rackId', 'container_id', 'rack_id', 'parentId']);
    case 'NETWORK':
      return null;
  }
}

function expectedParentKind(kind: CanonicalKind): CanonicalKind | null {
  switch (kind) {
    case 'NETWORK':
      return null;
    case 'SITE':
      return 'NETWORK';
    case 'STRUCTURE':
      return 'SITE';
    case 'LEVEL':
      return 'STRUCTURE';
    case 'ROOM_SUBSTRUCTURE':
      return 'LEVEL';
    case 'CONTAINER_CLUSTER_BAY':
      return 'ROOM_SUBSTRUCTURE';
    case 'POSITION':
      return 'CONTAINER_CLUSTER_BAY';
    case 'CONTAINER_RACK':
      return 'POSITION';
    case 'DEVICE':
    case 'EQUIPMENT':
      return 'CONTAINER_RACK';
  }
}

function resolveCanonicalId(
  key: string,
  idMap: Record<string, string>,
  createId: () => string,
): string {
  const existing = idMap[key];
  if (existing) {
    return existing;
  }
  const generated = createId();
  idMap[key] = generated;
  return generated;
}

function normalizeCoordinate(record: LegacyRecord): Readonly<{ row: string; column: number }> | null {
  const row = getString(record, ['row', 'gridRow']);
  const column = getNumber(record, ['column', 'gridColumn']);

  if (row && Number.isInteger(column) && (column ?? 0) > 0) {
    return { row: row.toUpperCase(), column: column as number };
  }

  const coordinate = getString(record, ['coordinate', 'gridCoordinate']);
  const match = coordinate?.match(/^([A-Za-z]+)[- ]?(\d+)$/);
  if (!match) {
    return null;
  }

  return { row: match[1]!.toUpperCase(), column: Number(match[2]) };
}

function normalizeContainerVariant(spec: SourceSpec, record: LegacyRecord): 'CONTAINER' | 'RACK' {
  if (spec.variant === 'RACK') {
    return 'RACK';
  }

  const explicit = getString(record, ['variant', 'containerVariant', 'type'])?.toUpperCase();
  if (explicit === 'RACK') {
    return 'RACK';
  }

  return getNumber(record, ['totalU', 'totalUnits', 'rackUnits', 'uHeight']) ? 'RACK' : 'CONTAINER';
}

function normalizeCas(
  record: LegacyRecord,
  totalU: number | undefined,
  warnings: MigrationWarning[],
  sourceCollection: string,
  id: string,
): readonly Record<string, unknown>[] {
  const source = Array.isArray(record.cas) ? record.cas : Array.isArray(record.CAS) ? record.CAS : null;

  if (!source) {
    return totalU
      ? [
          {
            id: randomUUID(),
            startU: 1,
            endU: totalU,
            state: 'AVAILABLE',
          },
        ]
      : [];
  }

  const ranges: Record<string, unknown>[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push({
        sourceCollection,
        legacyId: id,
        message: 'Skipped malformed CAS entry.',
      });
      continue;
    }

    const item = entry as LegacyRecord;
    const startU = getNumber(item, ['startU', 'startPosition']);
    const endU = getNumber(item, ['endU', 'endPosition']);
    const stateRaw = getString(item, ['state', 'status'])?.toUpperCase();
    const state =
      stateRaw === 'AVAILABLE' || stateRaw === 'RESERVED' || stateRaw === 'EQUIPPED'
        ? stateRaw
        : null;

    if (
      !Number.isInteger(startU) ||
      !Number.isInteger(endU) ||
      (startU ?? 0) < 1 ||
      (endU ?? 0) < (startU ?? 0) ||
      !state
    ) {
      warnings.push({
        sourceCollection,
        legacyId: id,
        message: 'Skipped CAS entry whose range/state could not be normalized.',
      });
      continue;
    }

    ranges.push({
      id: getString(item, ['id', '_id']) ?? randomUUID(),
      startU,
      endU,
      state,
      ...(getString(item, ['deviceId', 'occupantId'])
        ? { occupantLegacyId: getString(item, ['deviceId', 'occupantId']) }
        : {}),
      ...(getNumber(item, ['physicalSizeU', 'physicalSize']) !== null
        ? { physicalSizeU: getNumber(item, ['physicalSizeU', 'physicalSize']) }
        : {}),
      ...(getNumber(item, ['clearanceTopU']) !== null
        ? { clearanceTopU: getNumber(item, ['clearanceTopU']) }
        : {}),
      ...(getNumber(item, ['clearanceBottomU']) !== null
        ? { clearanceBottomU: getNumber(item, ['clearanceBottomU']) }
        : {}),
    });
  }

  return ranges;
}

function extraFields(
  spec: SourceSpec,
  record: LegacyRecord,
  warnings: MigrationWarning[],
  id: string,
): Record<string, unknown> | null {
  switch (spec.kind) {
    case 'ROOM_SUBSTRUCTURE':
      return { variant: spec.variant };
    case 'CONTAINER_CLUSTER_BAY':
      return { variant: spec.variant };
    case 'POSITION': {
      const coordinate = normalizeCoordinate(record);
      return coordinate ? { coordinate } : null;
    }
    case 'CONTAINER_RACK': {
      const variant = normalizeContainerVariant(spec, record);
      const total = getNumber(record, ['totalU', 'totalUnits', 'rackUnits', 'uHeight']);
      const totalU = total && Number.isInteger(total) && total > 0 ? total : undefined;

      if (variant === 'RACK' && !totalU) {
        return null;
      }

      return {
        variant,
        ...(totalU ? { totalU } : {}),
        cas: normalizeCas(record, totalU, warnings, spec.collection, id),
      };
    }
    case 'DEVICE': {
      if (Array.isArray(record.equipment) && record.equipment.length > 0) {
        warnings.push({
          sourceCollection: spec.collection,
          legacyId: id,
          message:
            'Embedded Equipment was not migrated under Device. Promote it explicitly as Container/Rack sibling input.',
        });
      }
      return {
        pinned: Boolean(record.pinned),
        ...(getString(record, ['serialNumber', 'serial', 'sn'])
          ? { serialNumber: getString(record, ['serialNumber', 'serial', 'sn']) }
          : {}),
        ...(getString(record, ['category']) ? { category: getString(record, ['category']) } : {}),
        ...(getString(record, ['deviceType', 'type'])
          ? { deviceType: getString(record, ['deviceType', 'type']) }
          : {}),
      };
    }
    case 'EQUIPMENT':
      return {
        pinned: Boolean(record.pinned),
        ...(getString(record, ['serialNumber', 'serial', 'sn'])
          ? { serialNumber: getString(record, ['serialNumber', 'serial', 'sn']) }
          : {}),
        ...(getString(record, ['category']) ? { category: getString(record, ['category']) } : {}),
        ...(getString(record, ['equipmentType', 'type'])
          ? { equipmentType: getString(record, ['equipmentType', 'type']) }
          : {}),
      };
    default:
      return {};
  }
}

export function planLegacyMigration(
  input: LegacyMigrationInput,
  options: Readonly<{ now?: string; createId?: () => string }> = {},
): MigrationPlan {
  const timestamp = options.now ?? new Date().toISOString();
  const createId = options.createId ?? randomUUID;
  const idMap: Record<string, string> = { ...(input.idMap ?? {}) };
  const warnings: MigrationWarning[] = [];
  const rejections: MigrationRejection[] = [];
  const nodes: CanonicalNode[] = [];
  const sourceRows: Array<Readonly<{ spec: SourceSpec; record: LegacyRecord }>> = [];

  const networkName = input.network.name.trim();
  if (!input.network.id.trim() || !networkName) {
    throw new Error('Migration input requires a canonical Network id and name.');
  }

  nodes.push({
    id: input.network.id.trim(),
    parentId: null,
    name: networkName,
    kind: 'NETWORK',
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  for (const spec of sourceSpecs) {
    for (const record of input.collections[spec.collection] ?? []) {
      sourceRows.push({ spec, record });
    }
  }

  sourceRows.sort((left, right) => order[left.spec.kind] - order[right.spec.kind]);

  const seenLegacyKeys = new Set<string>();

  for (const { spec, record } of sourceRows) {
    const id = legacyId(record);
    const name = nameOf(record);

    if (!id) {
      rejections.push({ sourceCollection: spec.collection, reason: 'MISSING_LEGACY_ID' });
      continue;
    }

    const key = migrationKey(spec.kind, id);
    if (seenLegacyKeys.has(key)) {
      rejections.push({
        sourceCollection: spec.collection,
        legacyId: id,
        reason: 'DUPLICATE_LEGACY_ID_FOR_KIND',
      });
      continue;
    }
    seenLegacyKeys.add(key);

    if (!name) {
      rejections.push({
        sourceCollection: spec.collection,
        legacyId: id,
        reason: 'MISSING_NAME',
      });
      continue;
    }

    const parentLegacy = parentLegacyId(spec.kind, record);
    const parentKind = expectedParentKind(spec.kind);
    let parentId: string | null = null;

    if (parentKind === 'NETWORK') {
      parentId = input.network.id.trim();
    } else if (parentKind) {
      if (!parentLegacy) {
        rejections.push({
          sourceCollection: spec.collection,
          legacyId: id,
          reason: 'MISSING_PARENT_REFERENCE',
        });
        continue;
      }
      const parentKey = migrationKey(parentKind, parentLegacy);
      parentId = idMap[parentKey] ?? null;
      if (!parentId) {
        rejections.push({
          sourceCollection: spec.collection,
          legacyId: id,
          reason: `UNRESOLVED_PARENT:${parentKey}`,
        });
        continue;
      }
    }

    const extras = extraFields(spec, record, warnings, id);
    if (extras === null) {
      rejections.push({
        sourceCollection: spec.collection,
        legacyId: id,
        reason:
          spec.kind === 'POSITION'
            ? 'INVALID_POSITION_COORDINATE'
            : 'INVALID_RACK_CAPACITY_OR_VARIANT',
      });
      continue;
    }

    const canonicalId = resolveCanonicalId(key, idMap, createId);
    nodes.push({
      id: canonicalId,
      legacyId: id,
      parentId,
      name,
      kind: spec.kind,
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...extras,
    });
  }

  return {
    nodes,
    idMap,
    warnings,
    rejections,
    counts: {
      source: sourceRows.length,
      transformed: nodes.length - 1,
      rejected: rejections.length,
    },
  };
}
