import process from 'node:process';

import { MongoClient, type Document } from 'mongodb';

const expectedParentKind = {
  SITE: 'NETWORK',
  STRUCTURE: 'SITE',
  LEVEL: 'STRUCTURE',
  ROOM_SUBSTRUCTURE: 'LEVEL',
  CONTAINER_CLUSTER_BAY: 'ROOM_SUBSTRUCTURE',
  POSITION: 'CONTAINER_CLUSTER_BAY',
  CONTAINER_RACK: 'POSITION',
  DEVICE: 'CONTAINER_RACK',
  EQUIPMENT: 'CONTAINER_RACK',
} as const;

type CanonicalKind = 'NETWORK' | keyof typeof expectedParentKind;

interface CliOptions {
  readonly fingerprint: string;
  readonly expected?: number;
}

interface StagedNode extends Document {
  readonly id?: unknown;
  readonly parentId?: unknown;
  readonly kind?: unknown;
  readonly migrationFingerprint?: unknown;
  readonly variant?: unknown;
  readonly totalU?: unknown;
  readonly coordinate?: unknown;
  readonly dimensionsMm?: unknown;
  readonly cas?: unknown;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const fingerprint = value('--fingerprint')?.trim();
  if (!fingerprint) throw new Error('--fingerprint is required.');

  const expectedRaw = value('--expected');
  const expected = expectedRaw ? Number(expectedRaw) : undefined;
  if (expectedRaw && (!Number.isInteger(expected) || (expected ?? 0) < 1)) {
    throw new Error('--expected must be a positive integer.');
  }

  return {
    fingerprint,
    ...(expected ? { expected } : {}),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isKind(value: unknown): value is CanonicalKind {
  return (
    value === 'NETWORK' || Object.prototype.hasOwnProperty.call(expectedParentKind, String(value))
  );
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function validateNodeShape(node: StagedNode, issues: string[]): void {
  const id = stringValue(node.id);
  const kind = node.kind;
  if (!id) {
    issues.push('A staged node is missing a canonical string id.');
    return;
  }
  if (!isKind(kind)) {
    issues.push(`${id}: unsupported kind ${String(kind)}.`);
    return;
  }

  if (kind === 'NETWORK') {
    if (node.parentId !== null) issues.push(`${id}: NETWORK parentId must be null.`);
    return;
  }

  if (!stringValue(node.parentId)) {
    issues.push(`${id}: ${kind} is missing parentId.`);
  }

  if (kind === 'POSITION') {
    const coordinate =
      node.coordinate && typeof node.coordinate === 'object' && !Array.isArray(node.coordinate)
        ? (node.coordinate as Record<string, unknown>)
        : null;
    const row = coordinate ? stringValue(coordinate.row) : null;
    const column = coordinate?.column;
    if (!row || !Number.isInteger(column) || Number(column) < 1) {
      issues.push(`${id}: POSITION has invalid coordinate.`);
    }
  }

  if (kind === 'CONTAINER_RACK') {
    const variant = stringValue(node.variant);
    if (variant !== 'RACK' && variant !== 'CONTAINER') {
      issues.push(`${id}: CONTAINER_RACK has invalid variant.`);
    }
    if (variant === 'RACK' && (!Number.isInteger(node.totalU) || Number(node.totalU) < 1)) {
      issues.push(`${id}: RACK requires positive integer totalU.`);
    }

    if (
      node.dimensionsMm &&
      typeof node.dimensionsMm === 'object' &&
      !Array.isArray(node.dimensionsMm)
    ) {
      const dimensions = node.dimensionsMm as Record<string, unknown>;
      if (!positiveNumber(dimensions.width) || !positiveNumber(dimensions.depth)) {
        issues.push(`${id}: dimensionsMm width/depth must be positive numbers.`);
      }
      if (dimensions.height !== undefined && !positiveNumber(dimensions.height)) {
        issues.push(`${id}: dimensionsMm height must be a positive number when present.`);
      }
    }

    if (!Array.isArray(node.cas)) {
      issues.push(`${id}: CONTAINER_RACK cas must be an array.`);
    } else {
      const seenRanges = new Set<string>();
      for (const rawRange of node.cas) {
        if (!rawRange || typeof rawRange !== 'object' || Array.isArray(rawRange)) {
          issues.push(`${id}: malformed CAS range.`);
          continue;
        }
        const range = rawRange as Record<string, unknown>;
        const rangeId = stringValue(range.id);
        const startU = range.startU;
        const endU = range.endU;
        if (!rangeId) {
          issues.push(`${id}: CAS range missing id.`);
        } else if (seenRanges.has(rangeId)) {
          issues.push(`${id}: duplicate CAS id ${rangeId}.`);
        } else {
          seenRanges.add(rangeId);
        }
        if (
          !Number.isInteger(startU) ||
          !Number.isInteger(endU) ||
          Number(startU) < 1 ||
          Number(endU) < Number(startU)
        ) {
          issues.push(`${id}: invalid CAS range bounds.`);
        }
        if (
          Number.isInteger(node.totalU) &&
          Number.isInteger(endU) &&
          Number(endU) > Number(node.totalU)
        ) {
          issues.push(`${id}: CAS endU exceeds totalU.`);
        }
      }
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
  if (!uri) throw new Error('MONGODB_URI is required.');

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const collection = client
      .db(databaseName)
      .collection<StagedNode>('topology_nodes_migration_staging');

    const nodes = await collection.find({ migrationFingerprint: options.fingerprint }).toArray();

    const issues: string[] = [];
    if (nodes.length === 0) {
      issues.push('No staged nodes found for the requested fingerprint.');
    }
    if (options.expected && nodes.length !== options.expected) {
      issues.push(`Expected ${options.expected} staged nodes but found ${nodes.length}.`);
    }

    const byId = new Map<string, StagedNode>();
    const counts: Record<string, number> = {};
    for (const node of nodes) {
      validateNodeShape(node, issues);
      const id = stringValue(node.id);
      const kind = isKind(node.kind) ? node.kind : null;
      if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
      if (!id) continue;
      if (byId.has(id)) issues.push(`Duplicate canonical id: ${id}.`);
      byId.set(id, node);
    }

    if ((counts.NETWORK ?? 0) !== 1) {
      issues.push(`Expected exactly one NETWORK; found ${counts.NETWORK ?? 0}.`);
    }

    for (const node of nodes) {
      const id = stringValue(node.id);
      const kind = isKind(node.kind) ? node.kind : null;
      if (!id || !kind || kind === 'NETWORK') continue;

      const parentId = stringValue(node.parentId);
      if (!parentId) continue;
      const parent = byId.get(parentId);
      if (!parent) {
        issues.push(`${id}: parent ${parentId} is not present in staging.`);
        continue;
      }

      const expectedKind = expectedParentKind[kind];
      if (parent.kind !== expectedKind) {
        issues.push(`${id}: expected parent kind ${expectedKind}, found ${String(parent.kind)}.`);
      }
    }

    for (const node of nodes) {
      if (node.kind !== 'CONTAINER_RACK' || !Array.isArray(node.cas)) continue;
      const rackId = stringValue(node.id);
      if (!rackId) continue;
      for (const rawRange of node.cas) {
        if (!rawRange || typeof rawRange !== 'object' || Array.isArray(rawRange)) continue;
        const occupantId = stringValue((rawRange as Record<string, unknown>).occupantId);
        if (!occupantId) continue;
        const occupant = byId.get(occupantId);
        if (!occupant) {
          issues.push(`${rackId}: CAS occupant ${occupantId} is missing from staging.`);
          continue;
        }
        if (
          (occupant.kind !== 'DEVICE' && occupant.kind !== 'EQUIPMENT') ||
          occupant.parentId !== rackId
        ) {
          issues.push(
            `${rackId}: CAS occupant ${occupantId} is not a Device/Equipment child of this rack.`,
          );
        }
      }
    }

    const result = {
      database: databaseName,
      collection: 'topology_nodes_migration_staging',
      fingerprint: options.fingerprint,
      staged: nodes.length,
      counts,
      valid: issues.length === 0,
      issues,
    };

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (issues.length > 0) process.exitCode = 2;
  } finally {
    await client.close();
  }
}

await main();
