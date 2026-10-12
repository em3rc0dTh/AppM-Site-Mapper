#!/usr/bin/env node
/**
 * Read-only integrity audit for a real MK1 MongoDB database.
 * Does not create indexes, rewrite documents, migrate data or expose credentials.
 * Exit 2 means domain inconsistencies were found.
 */
import { existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { auditActivePowerPaths } from './power-path-audit.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const uri = process.env.MONGODB_URI?.trim();
if (!uri) {
  console.error('MONGODB_URI is required in the ignored .env.local or environment.');
  process.exit(1);
}
const dbName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
const expectedDb = process.argv
  .find((argument) => argument.startsWith('--expect-db='))
  ?.slice('--expect-db='.length);
if (expectedDb && dbName !== expectedDb) {
  console.error(
    `Wrong MongoDB database: expected ${expectedDb}, configured ${dbName}. No query ran.`,
  );
  process.exit(1);
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2 });
const anomalies = [];
const counts = {};
const LIMIT = 100;

function issue(code, id, details = '') {
  counts[code] = (counts[code] ?? 0) + 1;
  if (anomalies.length < LIMIT) anomalies.push({ code, id, ...(details ? { details } : {}) });
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
try {
  await client.connect();
  const db = client.db(dbName);
  const [nodes, paths, bindings] = await Promise.all([
    db.collection('topology_nodes').find({}).toArray(),
    db.collection('power_paths').find({ lifecycle: 'ACTIVE' }).toArray(),
    db.collection('telemetry_bindings').find({ lifecycle: 'ACTIVE' }).toArray(),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const equipment = nodes.filter((n) => n.kind === 'EQUIPMENT');
  const portById = new Map();
  const activePortById = new Map();

  for (const node of nodes) {
    if (node.kind === 'DEVICE') {
      if (!Array.isArray(node.rootEquipmentIds)) {
        issue('MISSING_OR_INVALID_ROOT_EQUIPMENT_IDS', node.id);
      }
      for (const rootId of array(node.rootEquipmentIds)) {
        const root = byId.get(rootId);
        if (
          !root ||
          root.kind !== 'EQUIPMENT' ||
          root.deviceId !== node.id ||
          root.parentEquipmentId !== null
        ) {
          issue('INVALID_DEVICE_EQUIPMENT_ROOT', node.id, String(rootId));
        }
      }
    }
    if (node.kind !== 'EQUIPMENT') continue;
    if (!Array.isArray(node.accessPorts)) issue('MISSING_OR_INVALID_ACCESS_PORTS', node.id);
    if (!Array.isArray(node.children)) issue('MISSING_OR_INVALID_CHILDREN', node.id);
    const owner = byId.get(node.deviceId);
    if (!owner || owner.kind !== 'DEVICE') issue('MISSING_OWNER_DEVICE', node.id);
    if (node.parentEquipmentId) {
      const parent = byId.get(node.parentEquipmentId);
      if (!parent || parent.kind !== 'EQUIPMENT' || !array(parent.children).includes(node.id)) {
        issue('BROKEN_PARENT_COMPOSITION', node.id);
      }
    }
    const children = array(node.children);
    if (node.childMode === 'DYNAMIC' && children.some((id) => id === null)) {
      issue('NULL_DYNAMIC_CHILD', node.id);
    }
    const seenChildren = new Set();
    for (const id of children) {
      if (id === null) continue;
      if (seenChildren.has(id)) issue('DUPLICATE_CHILD', node.id, String(id));
      seenChildren.add(id);
      const child = byId.get(id);
      if (!child || child.kind !== 'EQUIPMENT' || child.parentEquipmentId !== node.id) {
        issue('DANGLING_OR_MISMATCHED_CHILD', node.id, String(id));
      }
    }
    for (const port of array(node.accessPorts)) {
      if (!port || typeof port !== 'object' || typeof port.id !== 'string') {
        issue('MALFORMED_ACCESS_PORT', node.id);
        continue;
      }
      if (portById.has(port.id)) issue('DUPLICATE_ACCESS_PORT_ID', node.id, port.id);
      portById.set(port.id, port);
      if (port.equipmentId !== node.id || port.deviceId !== node.deviceId) {
        issue('ACCESS_PORT_OWNERSHIP_MISMATCH', node.id, port.id);
      }
      if (port.lifecycle === 'ACTIVE') activePortById.set(port.id, port);
    }
  }

  const serialOwners = new Map();
  for (const node of nodes) {
    if (
      node.lifecycle === 'ACTIVE' &&
      (node.kind === 'DEVICE' || node.kind === 'EQUIPMENT') &&
      typeof node.serialNumber === 'string' &&
      node.serialNumber.trim()
    ) {
      const serial = node.serialNumber.trim();
      const existing = serialOwners.get(serial);
      if (existing) issue('DUPLICATE_ACTIVE_SERIAL', node.id, 'Also assigned to ' + existing);
      else serialOwners.set(serial, node.id);
    }
  }
  for (const item of equipment) {
    const seen = new Set();
    let current = item;
    while (current?.kind === 'EQUIPMENT') {
      if (seen.has(current.id)) {
        issue('CYCLIC_EQUIPMENT_PARENT', item.id);
        break;
      }
      seen.add(current.id);
      if (!current.parentEquipmentId) break;
      current = byId.get(current.parentEquipmentId);
    }
  }

  const powerSummary = auditActivePowerPaths(paths, activePortById, issue);

  for (const binding of bindings) {
    if (!byId.has(binding.targetId) && binding.targetType !== 'ACCESS_PORT') {
      issue('MISSING_TELEMETRY_TARGET', binding.id, String(binding.targetId));
    }
    if (binding.targetType === 'ACCESS_PORT' && !activePortById.has(binding.targetId)) {
      issue('MISSING_TELEMETRY_PORT', binding.id, String(binding.targetId));
    }
  }

  const report = {
    database: dbName,
    databaseProfile: /(^|_)crud_acceptance(_|$)/i.test(dbName)
      ? 'POSSIBLE_CRUD_ACCEPTANCE_DATABASE'
      : 'UNCLASSIFIED',
    mode: 'READ_ONLY',
    totals: {
      topologyNodes: nodes.length,
      equipment: equipment.length,
      activePowerPaths: paths.length,
      canonicalPowerPaths: powerSummary.canonicalPowerPaths,
      incompletePowerPaths: powerSummary.incompletePowerPaths,
      activeTelemetryBindings: bindings.length,
    },
    violations: counts,
    sampleAnomalies: anomalies,
    sampleLimit: LIMIT,
    status: Object.keys(counts).length ? 'NEEDS_REMEDIATION' : 'NO_VIOLATIONS_FOUND',
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'NO_VIOLATIONS_FOUND') process.exitCode = 2;
} catch (error) {
  console.error('Read-only audit failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
} finally {
  await client.close();
}
