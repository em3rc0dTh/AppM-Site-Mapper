#!/usr/bin/env node
/**
 * Isolated destructive HTTP acceptance: never run against a real inventory.
 * Requires the disposable MongoDB replica set provisioned by operational-http-e2e.yml.
 */
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';

if (
  process.env.CI_HTTP_ACCEPTANCE !== 'true' ||
  process.env.CI_COMBINED_E2E !== 'true' ||
  !/^site_mapper_http_ci_\d+$/.test(process.env.MONGODB_DB_NAME ?? '') ||
  !process.env.MONGODB_URI?.startsWith('mongodb://127.0.0.1:27017/')
) {
  throw new Error('REFUSING_DELETION_TEST_OUTSIDE_DISPOSABLE_CI');
}

const base = process.env.CI_HTTP_BASE_URL || 'http://127.0.0.1:3100';
const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();

const db = mongo.db(process.env.MONGODB_DB_NAME);
const cookie = await (async () => {
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'mk1-e2e-operator@local.test',
      password: 'CI-Only-E2E-Strong-2026!',
    }),
  });
  assert.equal(response.status, 200, 'Disposable Superadmin login required');
  const value = (response.headers.get('set-cookie') ?? '').split(';')[0];
  assert.ok(value.startsWith('appm_session='));
  return value;
})();

async function req(method, path, data, expected = 200, authenticated = true) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(authenticated ? { cookie } : {}),
      ...(data === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, expected,
    method + ' ' + path + ' => ' + response.status + ': ' + JSON.stringify(body));
  return body;
}

async function create(kind, parentId, name, extra = {}) {
  const body = await req('POST', '/api/topology', { kind, parentId, name, ...extra }, 201);
  assert.equal(body.node.kind, kind);
  return body.node;
}

async function port(equipment, name, direction) {
  const body = await req('POST', '/api/equipment/' + equipment.id + '/access-ports', {
    port: { name, portType: 'POWER', direction, exposure: 'EXTERNAL', feed: 'A' },
  }, 201);
  return body.port.id;
}

const identity = await req('GET', '/api/auth/session');
const actorId = identity.user.id;
assert.equal(identity.user.role, 'SUPERADMIN');

try {
  const rack = await db.collection('topology_nodes').findOne({
    kind: 'CONTAINER_RACK',
    name: 'CI LIMA Rack',
    lifecycle: 'ACTIVE',
  });
  assert.ok(rack?.id, 'Disposable Rack fixture missing');

  const d = await create('DEVICE', rack.id, 'CI DELETE Device Tree', { deviceType: 'CUSTOM' });
  const root = await create('EQUIPMENT', d.id, 'CI DELETE Root', {
    equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC',
  });
  const source = await create('EQUIPMENT', root.id, 'CI DELETE Source', {
    equipmentType: 'CUSTOM',
  });
  const target = await create('EQUIPMENT', root.id, 'CI DELETE Target', {
    equipmentType: 'CUSTOM',
  });
  const from = await port(source, 'CI DELETE output', 'OUTPUT');
  const to = await port(target, 'CI DELETE input', 'INPUT');
  const { path: powerPath } = await req('POST', '/api/power-paths', {
    sourceAccessPortId: from,
    targetAccessPortId: to,
    feed: 'A',
  }, 201);

  const reserve = await req('POST', '/api/racks/' + rack.id + '/cas', {
    action: 'reserve',
    mountStartU: 32,
    physicalSizeU: 4,
    clearanceTopU: 1,
    clearanceBottomU: 1,
  });
  const allocation = reserve.rack.cas.find((row) => row.state === 'RESERVED' &&
    row.mountStartU === 32 && row.physicalSizeU === 4);
  assert.ok(allocation, 'Expected a 4U Equipment plus 1U mounting margin per side');
  assert.equal(allocation.startU, 31);
  assert.equal(allocation.endU, 36);
  await req('POST', '/api/racks/' + rack.id + '/cas', {
    action: 'equip', allocationId: allocation.id, occupantId: root.id,
  });

  const path = '/api/topology/' + d.id + '/delete';
  const unauthorized = await req('GET', path + '?mode=TREE', undefined, 403, false);
  assert.equal(unauthorized.error, 'SESSION_INVALID');
  const preview = (await req('GET', path + '?mode=TREE')).preview;
  assert.equal(preview.totalNodes, 4);
  assert.equal(preview.deviceCount, 1);
  assert.equal(preview.equipmentCount, 3);
  assert.equal(preview.occupiedCasCount, 1);
  assert.equal(preview.powerPathCount, 1);
  assert.equal(preview.hasChildren, true);
  const single = (await req('GET', path + '?mode=SINGLE')).preview;
  assert.equal(single.totalNodes, 1);
  assert.equal(single.hasChildren, true);

  const blocked = await req('POST', path, {
    mode: 'SINGLE', name: d.name, token: single.token,
  }, 409);
  assert.equal(blocked.error, 'HAS_ACTIVE_CHILDREN');
  const wrongName = await req('POST', path, {
    mode: 'TREE', name: 'WRONG NAME', token: preview.token,
  }, 409);
  assert.equal(wrongName.error, 'DELETE_NAME_MISMATCH');
  const stale = await req('POST', path, {
    mode: 'TREE', name: d.name, token: '0'.repeat(64),
  }, 409);
  assert.equal(stale.error, 'DELETE_PREVIEW_STALE');

  const before = await db.collection('topology_nodes').countDocuments({
    id: { $in: [d.id, root.id, source.id, target.id] }, lifecycle: 'ACTIVE',
  });
  assert.equal(before, 4, 'Rejected confirmations must not mutate the inventory');

  const deleted = await req('POST', path, {
    mode: 'TREE', name: d.name, token: preview.token,
  });
  assert.equal(deleted.deleted, true);
  assert.ok(deleted.operationId);
  assert.equal(deleted.preview.totalNodes, 4);

  for (const node of [d, root, source, target]) {
    const document = await db.collection('topology_nodes').findOne({ id: node.id });
    assert.equal(document?.lifecycle, 'ARCHIVED', node.name);
    assert.equal(document?.retirement?.operationId, deleted.operationId);
    assert.equal(document?.retirement?.actorId, actorId);
    const direct = await req('GET', '/api/topology/' + node.id, undefined, 404);
    assert.equal(direct.error, 'NOT_FOUND');
  }
  const sourceAfter = await db.collection('topology_nodes').findOne({ id: source.id });
  assert.ok(sourceAfter.accessPorts.some((p) => p.id === from && p.lifecycle === 'ARCHIVED'));
  const archivedPower = await db.collection('power_paths').findOne({ id: powerPath.id });
  assert.equal(archivedPower?.lifecycle, 'ARCHIVED');
  const currentRack = await db.collection('topology_nodes').findOne({ id: rack.id });
  assert.equal(currentRack.lifecycle, 'ACTIVE');
  assert.equal(currentRack.cas.some((r) => r.occupantId === root.id), false);
  assert.equal(currentRack.cas.some((r) => r.state !== 'AVAILABLE' &&
    r.startU <= 36 && r.endU >= 31), false);
  const audit = await db.collection('admin_audit').findOne({
    action: 'TOPOLOGY_DELETE', targetId: d.id,
    'details.operationId': deleted.operationId,
  });
  assert.equal(audit?.actorId, actorId);
  assert.equal(audit?.details?.affected?.length, 4);
  assert.equal(audit?.details?.powerPathIds?.[0], powerPath.id);
  assert.equal(audit?.details?.historicalTelemetryPreserved, true);

  const replay = await req('POST', path, {
    mode: 'TREE', name: d.name, token: preview.token,
  }, 409);
  assert.equal(replay.error, 'ENTITY_NOT_ACTIVE');

  console.log('[PASS] MK1 DELETE: rejected SINGLE with children, bad name and stale preview');
  console.log('[PASS] MK1 DELETE: 4 archived nodes, retired PowerPath, freed 6U CAS, audit actor & IDs');
  console.log('[PASS] MK1 DELETE: no operational direct reads and original historical documents retained');

  // Independent leaf removal keeps its Device and its root Equipment operational.
  const d2 = await create('DEVICE', rack.id, 'CI DELETE Leaf Device', { deviceType: 'CUSTOM' });
  const root2 = await create('EQUIPMENT', d2.id, 'CI DELETE Leaf Root', {
    equipmentType: 'CHASSIS',
  });
  const leaf = await create('EQUIPMENT', root2.id, 'CI DELETE Leaf Child', {
    equipmentType: 'CUSTOM',
  });
  const only = (await req('GET', '/api/topology/' + leaf.id + '/delete?mode=SINGLE')).preview;
  assert.equal(only.totalNodes, 1);
  assert.equal(only.hasChildren, false);
  await req('POST', '/api/topology/' + leaf.id + '/delete', {
    mode: 'SINGLE', name: leaf.name, token: only.token,
  });
  assert.equal((await db.collection('topology_nodes').findOne({ id: root2.id })).lifecycle,
    'ACTIVE');
  assert.equal((await db.collection('topology_nodes').findOne({ id: d2.id })).lifecycle,
    'ACTIVE');
  const survivingRoot = await db.collection('topology_nodes').findOne({ id: root2.id });
  assert.equal(survivingRoot.children.includes(leaf.id), false);
  const rejectedRoot = (await req('GET',
    '/api/topology/' + root2.id + '/delete?mode=SINGLE')).preview;
  const rootResponse = await req('POST', '/api/topology/' + root2.id + '/delete', {
    mode: 'SINGLE', name: root2.name, token: rejectedRoot.token,
  }, 409);
  assert.equal(rootResponse.error, 'DELETE_OWNING_DEVICE_INSTEAD');
  console.log('[PASS] MK1 DELETE: individual leaf deletion and mandatory owning Device root protection');
} finally {
  await mongo.close();
}
