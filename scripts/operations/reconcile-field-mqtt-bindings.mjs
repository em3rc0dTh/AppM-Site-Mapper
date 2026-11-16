#!/usr/bin/env node
/**
 * Audits every active, commissioned breaker MQTT binding under the declared
 * FIELD_DUAL_12 Acrel meter map. No customer identities or credentials live here.
 *
 * Default: read-only plan. APPLY requires an explicit acknowledgement, a private
 * manifest, an on-disk pre-change snapshot, and a conflict-free plan. It archives
 * only incorrect breaker metric bindings, inserting replacements atomically.
 * It never edits devices, SNMP, SOURCE bindings, MQTT messages or history.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const apply = args.includes('--apply');
const manifestPath = option('--manifest', '.runtime/s05-commissioning-reference.json');
const backupPath = option('--backup');
const ack = option('--ack');
const mongoUri = process.env.MONGODB_URI;
const databaseName = option('--database', process.env.SITEMAPPER_DATABASE ?? 'seed-01');
const expectedQdfs = Number(option('--expected-qdfs', '3'));
const fail = (reason) => {
  console.error('FIELD_BINDING_ERROR: ' + reason);
  process.exit(2);
};
const PUBLISHED = Object.freeze({ A3: 1, A2: 3, B3: 5, B2: 7 });
const METRICS = new Set(['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY']);
const protectedMark = new Set(['ACREL_VERIFIED_CHANNEL', 'EXPLICIT_OPERATOR_CONFIRMATION']);
const fields = (slaveId, position) => {
  const channel = position <= 12 ? 1 : 2;
  const raw = ((position - 1) % 12) + 1;
  const point = '0_' + slaveId + '_' + raw;
  return { channel, rawPoint: point, canonical: point + '#' + channel,
    accepted: channel === 1 ? [point, point + '#1'] : [point + '#2'] };
};
const stableId = (source, point, metric) =>
  'recommission:mqtt-point:' +
  createHash('sha256').update([source, point, metric].join('|')).digest('hex');

if (!mongoUri) fail('MONGODB_URI must be set privately in the runtime environment');
if (!Number.isInteger(expectedQdfs) || expectedQdfs < 1) fail('invalid --expected-qdfs');
if (apply && (ack !== 'RECONCILE_FIELD_BINDINGS' || !backupPath))
  fail('--apply requires --ack RECONCILE_FIELD_BINDINGS and --backup .runtime/<private-file>.json');
if (apply && !path.resolve(backupPath).includes(path.sep + '.runtime' + path.sep))
  fail('backup must be stored under a private .runtime/ directory');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.qdfs) ||
    manifest.qdfs.length !== expectedQdfs)
  fail('expected schemaVersion 1 and exactly ' + expectedQdfs + ' QDFs');

const unique = (values) => new Set(values).size === values.length;
if (!unique(manifest.qdfs.map((q) => q.gateway?.serial))) fail('duplicate source serial');
for (const spec of manifest.qdfs) {
  if (!spec.key || !spec.deviceName || !spec.gateway?.serial || !spec.gateway?.name ||
      !Array.isArray(spec.meters)) fail('incomplete private QDF manifest');
  if (spec.meters.length !== 4 ||
      !unique(spec.meters.map((m) => m.panel)) ||
      !unique(spec.meters.map((m) => m.slaveId)) ||
      Object.entries(PUBLISHED).some(([panel, slave]) =>
        spec.meters.find((m) => m.panel === panel)?.slaveId !== slave))
    fail(spec.key + ': meter addresses must map A3=1, A2=3, B3=5, B2=7');
}

const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri, { appName: 'sitemapper-field-bindings-controlled-reconciliation' });
const findings = [];
const changes = [];
const blocks = [];
const report = (status, qdf, panel, breaker, details = {}) => {
  findings.push({ status, qdf, panel, breaker, ...details });
  if (status.startsWith('BLOCK_')) blocks.push({ status, qdf, panel, breaker });
};
const dbKey = (b) => [b.sourceIdentity, b.sourcePointId, b.metric.toUpperCase()].join('|');

try {
  await client.connect();
  const database = client.db(databaseName);
  const topology = database.collection('topology_nodes');
  const collection = database.collection('telemetry_bindings');
  for (const spec of manifest.qdfs) {
    const owners = await topology.find({ kind: 'DEVICE', deviceType: 'BDFB',
      name: spec.deviceName, lifecycle: 'ACTIVE' }).toArray();
    if (owners.length !== 1) {
      report('BLOCK_DEVICE_IDENTITY', spec.key, '*', '*');
      continue;
    }
    const owner = owners[0];
    const equipment = await topology.find({ kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE', deviceId: owner.id }).toArray();
    const gateway = equipment.filter((e) => e.name === spec.gateway.name);
    if (gateway.length !== 1 || gateway[0].serialNumber !== spec.gateway.serial) {
      report('BLOCK_GATEWAY_IDENTITY', spec.key, '*', '*');
      continue;
    }
    const meters = spec.meters.map((m) => ({
      reference: m, actual: equipment.filter((e) => e.name === m.name)
    }));
    for (const item of meters) {
      if (item.actual.length !== 1 ||
          item.actual[0].serialNumber !== item.reference.serial) {
        report('BLOCK_METER_IDENTITY', spec.key, item.reference.panel, '*');
      } else {
        const profile = await database.collection('industrial_communication_profiles')
          .findOne({ equipmentId: item.actual[0].id });
        if (profile && profile.role === 'METER' &&
            profile.rs485?.slaveId !== item.reference.slaveId)
          report('BLOCK_METER_SLAVE_CONFLICT', spec.key, item.reference.panel, '*');
      }
    }
    if (blocks.some((b) => b.qdf === spec.key)) continue;

    const byId = new Map(equipment.map((e) => [e.id, e]));
    const active = await collection.find({
      lifecycle: 'ACTIVE', protocol: 'MQTT', sourceIdentity: spec.gateway.serial
    }).toArray();
    const all = await collection.find({
      lifecycle: 'ACTIVE', protocol: 'MQTT',
      targetType: 'EQUIPMENT', targetId: { $in: equipment.map((e) => e.id) }
    }).toArray();
    const sourceOwners = active.filter((b) => !b.sourcePointId && b.metric === 'SOURCE');
    if (sourceOwners.length !== 1) {
      report('BLOCK_SOURCE_NOT_UNIQUE', spec.key, '*', '*',
        { count: sourceOwners.length });
      continue;
    }
    const sourceOwner = sourceOwners[0];
    if (!((sourceOwner.targetType === 'DEVICE' && sourceOwner.targetId === owner.id) ||
      (sourceOwner.targetType === 'EQUIPMENT' && byId.has(sourceOwner.targetId)))) {
      report('BLOCK_SOURCE_WRONG_QDF', spec.key, '*', '*');
      continue;
    }
    const expectedTargets = new Set();
    for (const [label, slaveId] of Object.entries(PUBLISHED)) {
      const panelList = equipment.filter((e) => e.equipmentType === 'PANEL' && e.name === label);
      if (panelList.length !== 1 || panelList[0].childMode !== 'POSITIONAL' ||
          !Array.isArray(panelList[0].children)) {
        report('BLOCK_PANEL_TOPOLOGY', spec.key, label, '*');
        continue;
      }
      const panel = panelList[0];
      for (const [index, id] of panel.children.entries()) {
        if (!id) continue; // unoccupied physical slot is NOT a commissioned breaker
        const breaker = byId.get(id);
        const labelPos = label + '-' + String(index + 1).padStart(2, '0');
        if (!breaker || breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
            breaker.parentEquipmentId !== panel.id || breaker.deviceId !== owner.id) {
          report('BLOCK_BREAKER_TOPOLOGY', spec.key, label, labelPos);
          continue;
        }
        expectedTargets.add(id);
        const expected = fields(slaveId, index + 1);
        const current = all.filter((b) => b.targetId === id && b.sourcePointId &&
          METRICS.has(b.metric.toUpperCase()));
        if (!current.length) {
          report('UNCOMMISSIONED', spec.key, label, labelPos);
          continue;
        }
        for (const binding of current) {
          const metric = binding.metric.toUpperCase();
          if (binding.sourceIdentity !== spec.gateway.serial) {
            report('BLOCK_FOREIGN_SOURCE', spec.key, label, labelPos,
              { bindingId: binding.id });
            continue;
          }
          if (expected.accepted.includes(binding.sourcePointId)) {
            const attr = binding.attributes ?? {};
            const meterId = meters.find((m) => m.reference.panel === label)?.actual[0]?.id;
            if ((attr.panelLabel !== undefined && attr.panelLabel !== label) ||
                (attr.position !== undefined && attr.position !== index + 1) ||
                (attr.matchedPanelId !== undefined && attr.matchedPanelId !== panel.id) ||
                (attr.meterEquipmentId !== undefined && attr.meterEquipmentId !== meterId) ||
                (attr.wireRawPointId !== undefined && attr.wireRawPointId !== expected.rawPoint) ||
                (attr.wireChannel !== undefined && attr.wireChannel !== expected.channel)) {
              report('BLOCK_BINDING_PROVENANCE', spec.key, label, labelPos, { metric });
              continue;
            }
            report('MATCH', spec.key, label, labelPos, { metric, sourcePointId: binding.sourcePointId });
            continue;
          }
          if (!/^0_[1357]_(?:[1-9]|1[0-2])(?:#[12])?$/.test(binding.sourcePointId) ||
              protectedMark.has(binding.attributes?.commissioning) ||
              binding.attributes?.panelId) {
            report('BLOCK_PROTECTED_OR_UNRECOGNIZED', spec.key, label, labelPos,
              { metric, bindingId: binding.id });
            continue;
          }
          const targetMetricBindings = current.filter((b) => b.metric.toUpperCase() === metric);
          if (targetMetricBindings.length !== 1) {
            report('BLOCK_MULTIPLE_TARGET_METRICS', spec.key, label, labelPos, { metric });
            continue;
          }
          const collision = active.find((b) => b.sourcePointId === expected.canonical &&
            b.metric.toUpperCase() === metric && b.id !== binding.id);
          const aliasCollision = expected.accepted.some((p) => active.some((b) =>
            b.sourcePointId === p && b.metric.toUpperCase() === metric &&
            b.id !== binding.id));
          if (collision || aliasCollision) {
            report('BLOCK_SOURCE_POINT_COLLISION', spec.key, label, labelPos, { metric });
            continue;
          }
          const idNew = stableId(spec.gateway.serial, expected.canonical, metric);
          const replacement = {
            id: idNew, protocol: 'MQTT', sourceIdentity: spec.gateway.serial,
            sourcePointId: expected.canonical, metric, unit: binding.unit,
            targetType: 'EQUIPMENT', targetId: id, lifecycle: 'ACTIVE',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            revision: 1,
            attributes: {
              ...binding.attributes,
              commissioning: 'FIELD_BINDING_RECONCILED',
              priorBindingId: binding.id,
              matchedPanelId: panel.id, panelLabel: label, position: index + 1,
              wireProfile: 'FIELD_DUAL_12', wireRawPointId: expected.rawPoint,
              wireChannel: expected.channel,
            }
          };
          changes.push({ old: binding, next: replacement, qdf: spec.key,
            panel: label, breaker: labelPos });
          report('REMAP', spec.key, label, labelPos, {
            metric, from: binding.sourcePointId, to: expected.canonical
          });
        }
      }
    }
    const orphans = active.filter((b) => b.sourcePointId && METRICS.has(b.metric.toUpperCase()) &&
      b.targetType === 'EQUIPMENT' && byId.get(b.targetId)?.equipmentType === 'CIRCUIT_BREAKER' &&
      !expectedTargets.has(b.targetId));
    if (orphans.length) report('BLOCK_ORPHAN_BINDINGS', spec.key, '*', '*',
      { count: orphans.length });
  }

  // An incomplete or conflicting field inventory must never be partly rewritten.
  const targets = changes.map((c) => c.next.sourceIdentity + '|' + c.next.sourcePointId + '|' + c.next.metric);
  if (!unique(targets)) report('BLOCK_DUPLICATE_PROPOSED_POINTS', '*', '*', '*');
  const summary = {
    status: blocks.length ? 'BLOCKED' : changes.length ? 'RECONCILIATION_REQUIRED' : 'NO_REMAP_REQUIRED',
    mode: apply ? 'APPLY' : 'PLAN_READ_ONLY', database: databaseName,
    scannedQdfs: manifest.qdfs.length, remaps: changes.length, blockers: blocks.length,
    matches: findings.filter((f) => f.status === 'MATCH').length,
    uncommissioned: findings.filter((f) => f.status === 'UNCOMMISSIONED').length,
    findings
  };
  console.log(JSON.stringify(summary, null, 2));
  if (blocks.length) { process.exitCode = 10; }
  else if (apply && changes.length) {
    // A private, pre-change snapshot is compulsory before the first mutation.
    await fs.mkdir(path.dirname(backupPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(backupPath, JSON.stringify({
      database: databaseName, capturedAt: new Date().toISOString(),
      originalBindings: changes.map((c) => c.old),
      proposedBindings: changes.map((c) => c.next)
    }, null, 2), { flag: 'wx', mode: 0o600 });

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const change of changes) {
          const original = change.old;
          const revisionFilter = original.revision === undefined
            ? { revision: { $exists: false } } : { revision: original.revision };
          const same = await collection.findOne({
            id: original.id, lifecycle: 'ACTIVE', sourceIdentity: original.sourceIdentity,
            sourcePointId: original.sourcePointId, targetId: original.targetId,
            metric: original.metric, ...revisionFilter
          }, { session });
          if (!same) throw Error('STALE_BINDING: ' + original.id);
          const collision = await collection.findOne({
            lifecycle: 'ACTIVE', protocol: 'MQTT',
            sourceIdentity: change.next.sourceIdentity,
            sourcePointId: { $in: fields(PUBLISHED[change.panel],
              Number(change.breaker.split('-').at(-1))).accepted },
            metric: change.next.metric
          }, { session });
          if (collision && collision.id !== original.id)
            throw Error('CONCURRENT_SOURCE_POINT_CONFLICT');
        }
        for (const change of changes) {
          const original = change.old;
          const revisionFilter = original.revision === undefined
            ? { revision: { $exists: false } } : { revision: original.revision };
          const result = await collection.updateOne({
            id: original.id, lifecycle: 'ACTIVE', ...revisionFilter
          }, {
            $set: {
              lifecycle: 'ARCHIVED', updatedAt: new Date().toISOString(),
              revision: (original.revision ?? 0) + 1,
              attributes: {
                ...original.attributes,
                retirementReason: 'FIELD_SLAVE_POINT_RECONCILIATION',
                replacementBindingId: change.next.id
              }
            }
          }, { session });
          if (result.matchedCount !== 1) throw Error('CONCURRENT_ARCHIVE_CONFLICT');
        }
        await collection.insertMany(changes.map((c) => c.next), { session, ordered: true });
      });
      console.log(JSON.stringify({ status: 'APPLIED', remaps: changes.length,
        backupPath, database: databaseName }));
    } finally {
      await session.endSession();
    }
  }
} finally {
  await client.close();
}
