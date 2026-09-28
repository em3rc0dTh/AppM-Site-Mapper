import { createHash } from 'node:crypto';

import type { LegacyMigrationInput, LegacyRecord, MigrationWarning } from './model.ts';

interface PreparedLegacyInput {
  readonly input: LegacyMigrationInput;
  readonly warnings: readonly MigrationWarning[];
}

function isRecord(value: unknown): value is LegacyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  if (isRecord(value) && '$oid' in value) {
    const oid = value.$oid;
    return typeof oid === 'string' && oid.trim() ? oid.trim() : null;
  }

  return null;
}

function getString(record: LegacyRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = scalar(record[key]);
    if (value) return value;
  }
  return null;
}

function getNumber(record: LegacyRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function deterministicId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  const variant = Number.parseInt(hex[16] ?? '8', 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function legacyId(record: LegacyRecord): string | null {
  return getString(record, ['id', '_id', 'legacyId']);
}

function labelOf(record: LegacyRecord, fallback: string): string {
  return getString(record, ['label', 'name', 'Name', 'title']) ?? fallback;
}

function normalizedCoordinate(record: LegacyRecord): string | null {
  const candidates = [record.coordinate, record.gridCoordinate, record.grid_coordinate];

  for (const candidate of candidates) {
    const raw = Array.isArray(candidate) ? scalar(candidate[0]) : scalar(candidate);
    const match = raw?.match(/^([A-Za-z]+)[- ]?(\d+)$/);
    if (match) return `${match[1]!.toUpperCase()}-${Number(match[2])}`;
  }

  const row = getString(record, ['row', 'gridRow']);
  const column = getNumber(record, ['column', 'gridColumn']);
  if (row && Number.isInteger(column) && (column ?? 0) > 0) {
    return `${row.toUpperCase()}-${column}`;
  }

  return null;
}

function directClusterParent(record: LegacyRecord): string | null {
  if (getString(record, ['positionId', 'position_id', 'position'])) return null;

  const parentType = getString(record, ['parentType'])?.toLowerCase();
  if (!parentType || !['cluster', 'containercluster', 'bay'].includes(parentType)) return null;

  return getString(record, ['parentId']);
}

function rackCapacity(record: LegacyRecord): number | undefined {
  const direct = getNumber(record, ['totalU', 'totalUnits', 'rackUnits', 'uHeight']);
  if (direct && Number.isInteger(direct) && direct > 0) return direct;

  const directMounting = isRecord(record.mounting) ? record.mounting : null;
  const directEnd = directMounting ? getNumber(directMounting, ['endU', 'endPosition']) : null;

  let maxEnd = directEnd && Number.isInteger(directEnd) && directEnd > 0 ? directEnd : 0;
  const source = Array.isArray(record.CAS)
    ? record.CAS
    : Array.isArray(record.cas)
      ? record.cas
      : [];

  for (const raw of source) {
    if (!isRecord(raw)) continue;
    const mounting = isRecord(raw.mounting) ? raw.mounting : raw;
    const end = getNumber(mounting, ['endU', 'endPosition']);
    if (end && Number.isInteger(end) && end > maxEnd) maxEnd = end;
  }

  return maxEnd > 0 ? maxEnd : undefined;
}

function normalizeCas(record: LegacyRecord): readonly LegacyRecord[] | undefined {
  const source = Array.isArray(record.CAS)
    ? record.CAS
    : Array.isArray(record.cas)
      ? record.cas
      : null;

  if (!source) return undefined;

  return source.flatMap((raw, index) => {
    if (!isRecord(raw)) return [];

    const mounting = isRecord(raw.mounting) ? raw.mounting : raw;
    const clearance = isRecord(mounting.clearance) ? mounting.clearance : null;
    const embeddedDevice = isRecord(raw.device) ? raw.device : null;
    const startU = getNumber(mounting, ['startU', 'startPosition']);
    const endU = getNumber(mounting, ['endU', 'endPosition']);
    const state = getString(raw, ['state', 'status', 'casStatus'])?.toUpperCase();

    if (!Number.isInteger(startU) || !Number.isInteger(endU) || !state) return [];

    return [
      {
        id:
          getString(raw, ['id', '_id']) ??
          deterministicId(`legacy-cas:${legacyId(record) ?? 'unknown'}:${index}`),
        startU,
        endU,
        state,
        ...(getNumber(mounting, ['physicalSizeU', 'physicalSize']) !== null
          ? { physicalSizeU: getNumber(mounting, ['physicalSizeU', 'physicalSize']) }
          : {}),
        ...(clearance && getNumber(clearance, ['top']) !== null
          ? { clearanceTopU: getNumber(clearance, ['top']) }
          : {}),
        ...(clearance && getNumber(clearance, ['bottom']) !== null
          ? { clearanceBottomU: getNumber(clearance, ['bottom']) }
          : {}),
        ...(getString(raw, ['deviceId', 'occupantId']) ??
        (embeddedDevice ? getString(embeddedDevice, ['id', '_id']) : null)
          ? {
              deviceId:
                getString(raw, ['deviceId', 'occupantId']) ??
                (embeddedDevice ? getString(embeddedDevice, ['id', '_id']) : null),
            }
          : {}),
      },
    ];
  });
}

function panelPrefix(
  panel: LegacyRecord,
  configured: Readonly<Record<string, string>> | undefined,
): string | null {
  const embedded = getString(panel, ['telemetryPrefix']);
  if (embedded) return embedded;

  const label = getString(panel, ['label', 'name']);
  const configuredPrefix = label ? configured?.[label] : undefined;
  return configuredPrefix?.trim() || null;
}

function normalizeBdfb(
  record: LegacyRecord,
  deviceId: string,
  configuredPrefixes: Readonly<Record<string, string>> | undefined,
): LegacyRecord | undefined {
  if (!Array.isArray(record.shelves)) return undefined;

  const shelves = record.shelves.flatMap((rawShelf, shelfIndex) => {
    if (!isRecord(rawShelf)) return [];
    const shelfId =
      getString(rawShelf, ['id', '_id']) ?? deterministicId(`legacy-bdfb:${deviceId}:shelf:${shelfIndex}`);
    const framesSource = Array.isArray(rawShelf.frames) ? rawShelf.frames : [];

    const frames = framesSource.flatMap((rawFrame, frameIndex) => {
      if (!isRecord(rawFrame)) return [];
      const frameId =
        getString(rawFrame, ['id', '_id']) ??
        deterministicId(`legacy-bdfb:${deviceId}:frame:${shelfIndex}:${frameIndex}`);
      const panelsSource = Array.isArray(rawFrame.panels) ? rawFrame.panels : [];

      const panels = panelsSource.flatMap((rawPanel, panelIndex) => {
        if (!isRecord(rawPanel)) return [];
        const panelId =
          getString(rawPanel, ['id', '_id']) ??
          deterministicId(
            `legacy-bdfb:${deviceId}:panel:${shelfIndex}:${frameIndex}:${panelIndex}`,
          );
        const prefix = panelPrefix(rawPanel, configuredPrefixes);
        const slots = Array.isArray(rawPanel.breakers)
          ? rawPanel.breakers
          : Array.isArray(rawPanel.holders)
            ? rawPanel.holders
            : [];

        const endpoints = slots.flatMap((rawSlot, slotIndex) => {
          if (!isRecord(rawSlot)) return [];

          const positionRaw = getNumber(rawSlot, ['position']);
          const position =
            positionRaw && Number.isInteger(positionRaw) && positionRaw > 0
              ? positionRaw
              : slotIndex + 1;
          const label = labelOf(rawSlot, `Holder ${position}`);
          const variant = /^holder\b/i.test(label) ? 'HOLDER' : 'BREAKER';
          const endpointId =
            getString(rawSlot, ['id', '_id']) ??
            deterministicId(
              `legacy-bdfb:${deviceId}:endpoint:${shelfIndex}:${frameIndex}:${panelIndex}:${position}`,
            );
          const capacity = getNumber(rawSlot, ['capacity']);
          const rawPointId = variant === 'BREAKER' && prefix ? `${prefix}${position}` : null;

          return [
            {
              id: endpointId,
              variant,
              label,
              ...(variant === 'BREAKER' && capacity !== null ? { capacity } : {}),
              ...(rawPointId ? { telemetry: { rawPointId } } : {}),
            },
          ];
        });

        return [
          {
            id: panelId,
            label: labelOf(rawPanel, `Panel ${panelIndex + 1}`),
            endpoints,
          },
        ];
      });

      return [
        {
          id: frameId,
          label: labelOf(rawFrame, `Frame ${frameIndex + 1}`),
          panels,
          ...(typeof rawFrame.visible === 'boolean'
            ? { presentation: { physicalFrameVisible: rawFrame.visible } }
            : {}),
        },
      ];
    });

    return [
      {
        id: shelfId,
        label: labelOf(rawShelf, `Shelf ${shelfIndex + 1}`),
        frames,
      },
    ];
  });

  return shelves.length > 0 ? { shelves } : undefined;
}

function prepareContainer(
  record: LegacyRecord,
  warnings: MigrationWarning[],
  sourceCollection: string,
): LegacyRecord {
  const id = legacyId(record);
  const totalU = rackCapacity(record);
  const normalizedCas = normalizeCas(record);
  const explicitType = getString(record, ['type', 'variant', 'containerVariant'])?.toUpperCase();
  const declaresRack = explicitType === 'RACK' || explicitType === 'CABINET';

  if (declaresRack && !totalU && id) {
    warnings.push({
      sourceCollection,
      legacyId: id,
      message:
        'Legacy container declared Rack/Cabinet without evidence of U capacity; migrated as CONTAINER.',
    });
  }

  return {
    ...record,
    ...(totalU ? { totalU, type: 'RACK' } : declaresRack ? { type: 'CONTAINER' } : {}),
    ...(normalizedCas ? { cas: normalizedCas } : {}),
  };
}

export function prepareLegacyMigrationInput(input: LegacyMigrationInput): PreparedLegacyInput {
  const warnings: MigrationWarning[] = [];
  const collections: Record<string, readonly LegacyRecord[]> = { ...input.collections };
  const derivedPositions: LegacyRecord[] = [
    ...(input.collections.Position ?? []),
    ...(input.collections.positions ?? []),
  ];

  for (const collectionName of ['Container', 'containers', 'Rack', 'racks'] as const) {
    const source = input.collections[collectionName];
    if (!source) continue;

    collections[collectionName] = source.map((raw) => {
      const record = prepareContainer(raw, warnings, collectionName);
      const id = legacyId(record);
      const clusterId = directClusterParent(record);
      const coordinate = normalizedCoordinate(record);

      if (!id || !clusterId || !coordinate) return record;

      const derivedId = `${id}::derived-position`;
      derivedPositions.push({
        id: derivedId,
        name: coordinate,
        clusterId,
        coordinate,
      });

      warnings.push({
        sourceCollection: collectionName,
        legacyId: id,
        message: `Derived canonical Position ${coordinate} from legacy grid_coordinate and direct cluster parent.`,
      });

      return { ...record, positionId: derivedId };
    });
  }

  if (derivedPositions.length > 0) {
    collections.Position = derivedPositions;
    delete collections.positions;
  }

  for (const collectionName of ['Device', 'devices'] as const) {
    const source = input.collections[collectionName];
    if (!source) continue;

    collections[collectionName] = source.map((record) => {
      const id = legacyId(record);
      if (!id) return record;

      const configuredPrefixes = input.bfdbPanelTelemetryPrefixes?.[id];
      const bdfb = normalizeBdfb(record, id, configuredPrefixes);
      return bdfb ? { ...record, _mk1Bdfb: bdfb } : record;
    });
  }

  return {
    input: { ...input, collections },
    warnings,
  };
}
