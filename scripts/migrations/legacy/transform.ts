import { createHash, randomUUID } from 'node:crypto';

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
  { collection: 'rooms', kind: 'ROOM_SUBSTRUCTURE', variant: 'ROOM' },
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

  if (
    value &&
    typeof value === 'object' &&
    'toHexString' in value &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  ) {
    const hex = (value as { toHexString: () => string }).toHexString();
    return hex.trim() ? hex.trim() : null;
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

function getNestedNumber(record: LegacyRecord, path: readonly string[]): number | null {
  let value: unknown = record;
  for (const key of path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function normalizePolygon(
  record: LegacyRecord,
): readonly Readonly<{ x: number; y: number }>[] | undefined {
  const source = Array.isArray(record.polygon)
    ? record.polygon
    : Array.isArray(record.points)
      ? record.points
      : null;
  if (!source) return undefined;

  const points = source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const point = entry as Record<string, unknown>;
    const x =
      typeof point.x === 'number'
        ? point.x
        : typeof point.x === 'string' && Number.isFinite(Number(point.x))
          ? Number(point.x)
          : null;
    const y =
      typeof point.y === 'number'
        ? point.y
        : typeof point.y === 'string' && Number.isFinite(Number(point.y))
          ? Number(point.y)
          : null;
    return x !== null && y !== null ? [{ x, y }] : [];
  });

  return points.length >= 3 ? points : undefined;
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
      return getString(record, ['siteId', 'site_id', 'site', 'parentId']);
    case 'LEVEL':
      return getString(record, ['structureId', 'structure_id', 'structure', 'parentId']);
    case 'ROOM_SUBSTRUCTURE':
      return getString(record, ['levelId', 'level_id', 'level', 'parentId']);
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
      // "position" in the legacy Container is frequently a numeric display/order field,
      // not a foreign key. Only explicit position ids or parentId are relationship refs.
      return getString(record, ['positionId', 'position_id', 'parentId']);
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

function normalizeCoordinate(
  record: LegacyRecord,
): Readonly<{ row: string; column: number }> | null {
  const row = getString(record, ['row', 'gridRow']);
  const column = getNumber(record, ['column', 'gridColumn']);

  if (row && Number.isInteger(column) && (column ?? 0) > 0) {
    return { row: row.toUpperCase(), column: column as number };
  }

  const appMObject =
    record.appMObject && typeof record.appMObject === 'object' && !Array.isArray(record.appMObject)
      ? (record.appMObject as LegacyRecord)
      : null;
  const sourceGridCoordinate = Array.isArray(record.grid_coordinate)
    ? record.grid_coordinate
    : appMObject && Array.isArray(appMObject.grid_coordinate)
      ? appMObject.grid_coordinate
      : null;
  const arrayCoordinate = sourceGridCoordinate
    ? sourceGridCoordinate.map((value) => scalar(value)).find(Boolean)
    : null;
  const coordinate =
    getString(record, ['coordinate', 'gridCoordinate', 'grid_coordinate']) ?? arrayCoordinate;
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

  const explicit = getString(record, [
    'variant',
    'containerVariant',
    'type',
    'category',
  ])?.toUpperCase();
  if (explicit === 'RACK' || explicit === 'CABINET') {
    return 'RACK';
  }

  const capacityTotal = getNestedNumber(record, ['capacity', 'total']);
  const heightRu = getNestedNumber(record, ['dimensions', 'heightRu']);
  return getNumber(record, ['totalU', 'totalUnits', 'rackUnits', 'uHeight']) ||
    capacityTotal ||
    heightRu
    ? 'RACK'
    : 'CONTAINER';
}

function deterministicMigrationId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  const variant = Number.parseInt(hex[16] ?? '8', 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function totalUFromCas(record: LegacyRecord): number | undefined {
  const source = Array.isArray(record.cas)
    ? record.cas
    : Array.isArray(record.CAS)
      ? record.CAS
      : null;
  if (!source) return undefined;

  const ends = source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as LegacyRecord;
    const endU =
      getNumber(item, ['endU', 'endPosition']) ??
      getNestedNumber(item, ['mounting', 'endPosition']);
    return Number.isInteger(endU) && (endU ?? 0) > 0 ? [endU as number] : [];
  });

  return ends.length ? Math.max(...ends) : undefined;
}

function normalizeCas(
  record: LegacyRecord,
  totalU: number | undefined,
  warnings: MigrationWarning[],
  sourceCollection: string,
  id: string,
): readonly Record<string, unknown>[] {
  const source = Array.isArray(record.cas)
    ? record.cas
    : Array.isArray(record.CAS)
      ? record.CAS
      : null;

  if (!source) {
    return totalU
      ? [
          {
            id: deterministicMigrationId(`CAS:${id}:1:${totalU}`),
            startU: 1,
            endU: totalU,
            state: 'AVAILABLE',
          },
        ]
      : [];
  }

  const ranges: Record<string, unknown>[] = [];
  for (const [index, entry] of source.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push({
        sourceCollection,
        legacyId: id,
        message: 'Skipped malformed CAS entry.',
      });
      continue;
    }

    const item = entry as LegacyRecord;
    const startU =
      getNumber(item, ['startU', 'startPosition']) ??
      getNestedNumber(item, ['mounting', 'startPosition']);
    const endU =
      getNumber(item, ['endU', 'endPosition']) ??
      getNestedNumber(item, ['mounting', 'endPosition']);
    const stateRaw = getString(item, ['state', 'status', 'casStatus'])?.toUpperCase();
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
      id:
        getString(item, ['id', '_id']) ??
        deterministicMigrationId(`CAS:${id}:${index}:${startU}:${endU}`),
      startU,
      endU,
      state,
      ...(() => {
        const embeddedDevice =
          item.device && typeof item.device === 'object' && !Array.isArray(item.device)
            ? (item.device as LegacyRecord)
            : null;
        const occupantLegacyId =
          getString(item, ['deviceId', 'occupantId']) ??
          (embeddedDevice ? getString(embeddedDevice, ['id', '_id', 'originalId']) : null);
        return occupantLegacyId ? { occupantLegacyId } : {};
      })(),
      ...(() => {
        const physicalSizeU =
          getNumber(item, ['physicalSizeU', 'physicalSize']) ??
          getNestedNumber(item, ['mounting', 'physicalSize']);
        return physicalSizeU !== null ? { physicalSizeU } : {};
      })(),
      ...(() => {
        const clearanceTopU =
          getNumber(item, ['clearanceTopU']) ??
          getNestedNumber(item, ['mounting', 'clearance', 'top']);
        return clearanceTopU !== null ? { clearanceTopU } : {};
      })(),
      ...(() => {
        const clearanceBottomU =
          getNumber(item, ['clearanceBottomU']) ??
          getNestedNumber(item, ['mounting', 'clearance', 'bottom']);
        return clearanceBottomU !== null ? { clearanceBottomU } : {};
      })(),
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
    case 'SITE':
    case 'STRUCTURE': {
      const polygon = normalizePolygon(record);
      return polygon ? { polygon } : {};
    }
    case 'LEVEL': {
      if (record.migrationParentSource === 'legacy-site-level-fallback') {
        warnings.push({
          sourceCollection: spec.collection,
          legacyId: id,
          message:
            'Rebound Site-parented Level to the unique Structure without a direct Level, preserving the legacy structure fallback behavior.',
        });
      }
      return {};
    }
    case 'ROOM_SUBSTRUCTURE': {
      const polygon = normalizePolygon(record);
      return { variant: spec.variant, ...(polygon ? { polygon } : {}) };
    }
    case 'CONTAINER_CLUSTER_BAY': {
      const explicit = getString(record, ['variant', 'category', 'type'])?.toUpperCase();
      const variant =
        explicit === 'BAY'
          ? 'BAY'
          : explicit === 'CONTAINER_CLUSTER'
            ? 'CONTAINER_CLUSTER'
            : spec.variant;
      return { variant };
    }
    case 'POSITION': {
      const coordinate = normalizeCoordinate(record);
      if (!coordinate) return null;
      if (record.migrationDerived === true) {
        warnings.push({
          sourceCollection: spec.collection,
          legacyId: id,
          message:
            'Canonical Position was derived because the legacy Container was attached directly to a ContainerCluster.',
        });
      }
      return { coordinate };
    }
    case 'CONTAINER_RACK': {
      const variant = normalizeContainerVariant(spec, record);
      const explicitTotal = getNumber(record, ['totalU', 'totalUnits', 'rackUnits', 'uHeight']);
      const capacityTotal = getNestedNumber(record, ['capacity', 'total']);
      const heightRu =
        getNestedNumber(record, ['dimensions', 'heightRu']) ??
        getNestedNumber(record, ['appMObject', 'heightRu']);
      const mountedEnd = getNestedNumber(record, ['mounting', 'endPosition']);
      const casEnd = totalUFromCas(record);
      const totalCandidate = explicitTotal ?? capacityTotal ?? heightRu ?? casEnd ?? mountedEnd;
      let totalU =
        totalCandidate && Number.isInteger(totalCandidate) && totalCandidate > 0
          ? totalCandidate
          : undefined;

      if (variant === 'RACK' && !totalU) {
        totalU = 42;
        warnings.push({
          sourceCollection: spec.collection,
          legacyId: id,
          message:
            'Rack has no persisted RU capacity; applied the legacy Site Mapper rack-popup fallback of 42U.',
        });
      }

      const width =
        getNestedNumber(record, ['dimensions', 'width']) ??
        getNumber(record, ['widthMm', 'width', 'w']);
      const depth =
        getNestedNumber(record, ['dimensions', 'depth']) ??
        getNumber(record, ['depthMm', 'depth', 'h']);
      const height =
        getNestedNumber(record, ['dimensions', 'height']) ??
        getNumber(record, ['heightMm', 'height']);
      const dimensionsMm =
        width && width > 0 && depth && depth > 0
          ? {
              width,
              depth,
              ...(height && height > 0 ? { height } : {}),
            }
          : undefined;

      return {
        variant,
        ...(totalU ? { totalU } : {}),
        ...(dimensionsMm ? { dimensionsMm } : {}),
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
      const bdfb =
        record.bdfb && typeof record.bdfb === 'object' && !Array.isArray(record.bdfb)
          ? record.bdfb
          : undefined;
      return {
        pinned: Boolean(record.pinned ?? record.isPinned),
        ...(getString(record, ['serialNumber', 'serial', 'sn'])
          ? { serialNumber: getString(record, ['serialNumber', 'serial', 'sn']) }
          : {}),
        ...(getString(record, ['category']) ? { category: getString(record, ['category']) } : {}),
        ...(getString(record, ['deviceType', 'type'])
          ? { deviceType: getString(record, ['deviceType', 'type']) }
          : {}),
        ...(bdfb ? { bdfb } : {}),
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

function sourceFingerprint(input: LegacyMigrationInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        network: input.network,
        collections: input.collections,
      }),
    )
    .digest('hex');
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

  const resolvedNodes = nodes.map((node) => {
    if (node.kind !== 'CONTAINER_RACK' || !Array.isArray(node.cas)) {
      return node;
    }

    const cas = node.cas.map((range) => {
      if (!range || typeof range !== 'object' || !('occupantLegacyId' in range)) {
        return range;
      }

      const legacyOccupant = scalar((range as Record<string, unknown>).occupantLegacyId);
      if (!legacyOccupant) {
        return range;
      }

      const occupantId =
        idMap[migrationKey('DEVICE', legacyOccupant)] ??
        idMap[migrationKey('EQUIPMENT', legacyOccupant)];

      const copy = { ...(range as Record<string, unknown>) };
      delete copy.occupantLegacyId;

      if (!occupantId) {
        warnings.push({
          sourceCollection: 'CAS',
          legacyId: legacyOccupant,
          message: 'CAS occupant reference could not be resolved; occupancy reference omitted.',
        });
        return copy;
      }

      return { ...copy, occupantId };
    });

    return { ...node, cas };
  });

  return {
    sourceFingerprint: sourceFingerprint(input),
    nodes: resolvedNodes,
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
