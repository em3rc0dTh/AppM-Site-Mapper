#!/usr/bin/env node
/**
 * Read-only domain parity check between a private Mongo EJSON snapshot and
 * a target installation. Never uploads the snapshot or changes any database.
 *
 * Usage:
 * node scripts/seed-01-parity.mjs --snapshot ./seed-01-topology-full.json \
 *   --uri 'mongodb://127.0.0.1:27017/?directConnection=true' --database seed-01-restore-check
 * Add --exact-ids to check restored snapshot identity as well as topology.
 */
import { readFile } from 'node:fs/promises';
import { MongoClient, EJSON } from 'mongodb';

function argsOf(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exact-ids') {
      flags.set('exact-ids', true);
      continue;
    }
    if (!argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--'))
      throw new Error('Expected --snapshot FILE --uri URI --database NAME [--exact-ids]');
    flags.set(argv[i].slice(2), argv[++i]);
  }
  for (const key of ['snapshot', 'uri', 'database']) {
    if (!flags.has(key)) throw new Error('Missing required --' + key);
  }
  return flags;
}
function keyFor(n) {
  return [n.kind, n.name, n.lifecycle ?? 'ACTIVE'].map(String).join(':');
}
function topologyIndex(nodes) {
  const ids = new Map();
  for (const n of nodes) {
    if (!n.id || ids.has(n.id)) throw new Error('Missing or duplicated topology id');
    ids.set(n.id, n);
  }
  const pathCache = new Map(),
    busy = new Set();
  function path(id) {
    if (pathCache.has(id)) return pathCache.get(id);
    const n = ids.get(id);
    if (!n) throw new Error('Dangling parentId: ' + id);
    if (busy.has(id)) throw new Error('Cycle: ' + id);
    busy.add(id);
    const value = (n.parentId ? path(n.parentId) + '/' : '') + keyFor(n);
    busy.delete(id);
    pathCache.set(id, value);
    return value;
  }
  const byPath = new Map();
  for (const n of nodes) {
    const p = path(n.id);
    if (byPath.has(p)) throw new Error('Ambiguous sibling path ' + p);
    byPath.set(p, n);
  }
  return { ids, byPath, path };
}
function canonical(n, index) {
  const c = {};
  const fields = [
    'kind',
    'name',
    'lifecycle',
    'variant',
    'polygon',
    'coordinate',
    'placementMm',
    'placementState',
    'dimensionsMm',
    'totalU',
    'deviceType',
    'equipmentType',
    'childMode',
    'category',
    'manufacturer',
    'model',
    'serialNumber',
    'aliases',
    'presentation',
  ];
  for (const field of fields) {
    if (n[field] !== undefined) c[field] = n[field];
  }
  if (n.kind === 'EQUIPMENT') {
    c.children = (n.children ?? []).map((id) => (id ? index.path(id) : null));
    c.accessPorts = (n.accessPorts ?? []).map((port) => ({
      name: port.name,
      portType: port.portType,
      direction: port.direction,
      exposure: port.exposure,
      protocol: port.protocol,
      attributes: port.attributes && {
        ...port.attributes,
        servedPanelIds: Array.isArray(port.attributes.servedPanelIds)
          ? port.attributes.servedPanelIds.map((id) => index.path(id))
          : port.attributes.servedPanelIds,
      },
      lifecycle: port.lifecycle,
    }));
    c.rackPlacement = n.rackPlacement && {
      ...n.rackPlacement,
      rackId: index.path(n.rackPlacement.rackId),
    };
    c.device = index.path(n.deviceId);
  }
  if (n.kind === 'DEVICE') {
    c.rootEquipmentIds = (n.rootEquipmentIds ?? []).map((id) => index.path(id));
  }
  if (n.kind === 'CONTAINER_RACK') {
    c.cas = (n.cas ?? []).map((range) => ({
      ...range,
      id: undefined,
      occupantId: range.occupantId ? index.path(range.occupantId) : undefined,
    }));
  }
  return c;
}
function stable(x) {
  if (Array.isArray(x)) return x.map(stable);
  if (x && typeof x === 'object') {
    return Object.fromEntries(
      Object.keys(x)
        .sort()
        .filter((k) => x[k] !== undefined)
        .map((k) => [k, stable(x[k])]),
    );
  }
  return x;
}
async function main() {
  const options = argsOf(process.argv.slice(2));
  const source = EJSON.parse(await readFile(options.get('snapshot'), 'utf8'));
  if (
    source.database !== 'seed-01' ||
    !Array.isArray(source.topology) ||
    !source.seedState?.some((state) => state.profile === 'seed-01')
  ) {
    throw new Error('Expected operator seed-01 EJSON snapshot with topology + seedState');
  }
  const client = new MongoClient(options.get('uri'), { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const target = client.db(options.get('database'));
    const current = await target.collection('topology_nodes').find({}).toArray();
    const expected = topologyIndex(source.topology);
    const actual = topologyIndex(current);
    const diffs = [];
    for (const [path, node] of expected.byPath) {
      const other = actual.byPath.get(path);
      if (!other) {
        diffs.push('MISSING ' + path);
        continue;
      }
      if (options.has('exact-ids') && node.id !== other.id) diffs.push('ID ' + path);
      if (
        JSON.stringify(stable(canonical(node, expected))) !==
        JSON.stringify(stable(canonical(other, actual)))
      )
        diffs.push('FIELDS ' + path);
    }
    for (const path of actual.byPath.keys()) {
      if (!expected.byPath.has(path)) diffs.push('EXTRA ' + path);
    }
    console.log(
      JSON.stringify(
        {
          sourceNodes: source.topology.length,
          targetNodes: current.length,
          exactIds: options.has('exact-ids'),
          differences: diffs.length,
          details: diffs.slice(0, 150),
        },
        null,
        2,
      ),
    );
    if (diffs.length) process.exitCode = 2;
  } finally {
    await client.close();
  }
}
main().catch((error) => {
  console.error('PARITY_CHECK_FAILED:', error.message);
  process.exitCode = 1;
});
