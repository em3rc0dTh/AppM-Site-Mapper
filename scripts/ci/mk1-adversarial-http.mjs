#!/usr/bin/env node
/**
 * MK1 red-team wheel: bounded, reproducible HTTP fault probes.
 * This script MUST run only after the normal CI HTTP journey on disposable
 * localhost MongoDB. It never targets user-provided URLs or remote hosts.
 */
import assert from 'node:assert/strict';

if (
  process.env.CI_HTTP_ACCEPTANCE !== 'true' ||
  process.env.CI_COMBINED_E2E !== 'true' ||
  !/^site_mapper_http_ci_[0-9]+$/.test(process.env.MONGODB_DB_NAME ?? '') ||
  !process.env.MONGODB_URI?.includes('127.0.0.1:27017') ||
  (process.env.CI_HTTP_BASE_URL ?? '') !== 'http://127.0.0.1:3100'
) {
  throw new Error('Adversarial wheel requires isolated GitHub Actions MongoDB and localhost HTTP.');
}

const base = 'http://127.0.0.1:3100';
const results = [];
const log = (name, details = {}) => {
  results.push({ name, ...details });
  console.log('[REDTEAM PASS] ' + name + ' ' + JSON.stringify(details));
};

async function request(method, path, payload, opts = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.headers ?? {}),
    },
    ...(payload === undefined ? {} : { body: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, response };
}

const login = await request('POST', '/api/auth/login', {
  email: 'mk1-e2e-operator@local.test',
  password: 'CI-Only-E2E-Strong-2026!',
});
assert.equal(login.status, 200, 'CI operator login unavailable');
const cookie = (login.response.headers.get('set-cookie') || '').split(';')[0];
assert.ok(cookie.startsWith('appm_session='));
const call = (method, path, payload, opts = {}) => request(method, path, payload, { cookie, ...opts });

async function nodes(parentId) {
  const r = await call('GET', parentId ? '/api/topology?parentId=' + encodeURIComponent(parentId) : '/api/topology');
  assert.equal(r.status, 200, 'Topology listing must remain available');
  return r.body.nodes;
}
async function locate(parentId, kind) {
  const children = await nodes(parentId);
  const node = children.find((child) => child.kind === kind);
  assert.ok(node, 'Could not find CI fixture ' + kind);
  return node;
}

const network = (await nodes())[0];
assert.ok(network?.id);
const site = await locate(network.id, 'SITE');
const structure = await locate(site.id, 'STRUCTURE');
const level = await locate(structure.id, 'LEVEL');
const room = await locate(level.id, 'ROOM_SUBSTRUCTURE');
const bay = await locate(room.id, 'CONTAINER_CLUSTER_BAY');
const originalPosition = await locate(bay.id, 'POSITION');
const originalRack = await locate(originalPosition.id, 'CONTAINER_RACK');
const device = await locate(originalRack.id, 'DEVICE');
const panel = (await nodes(device.id)).find((e) => e.kind === 'EQUIPMENT' && e.equipmentType === 'PANEL');
assert.ok(panel, 'Expected CI panel fixture');

const newPosition = await call('POST', '/api/topology', {
  kind: 'POSITION', parentId: bay.id, name: 'REDTEAM free rack slot',
  coordinate: { row: 'Z', column: 1 },
});
assert.equal(newPosition.status, 201, JSON.stringify(newPosition.body));
const positionId = newPosition.body.node.id;

// Attack 1: parallel create on the SAME parent Position. A race must never
// create two active racks or return unhandled 500s.
const racks = await Promise.all(
  Array.from({ length: 16 }, (_, i) =>
    call('POST', '/api/topology', {
      kind: 'CONTAINER_RACK', parentId: positionId,
      name: 'REDTEAM rack contender ' + i, containerVariant: 'RACK', totalU: 42,
    }),
  ),
);
const rackWins = racks.filter((r) => r.status === 201).length;
const rackUnexpected = racks.filter((r) => ![201, 409, 422].includes(r.status));
assert.equal(rackUnexpected.length, 0, 'Unexpected rack contention errors: ' + JSON.stringify(rackUnexpected));
assert.equal(rackWins, 1, 'Concurrent writers created multiple/no racks: ' + racks.map((r) => r.status).join(','));
assert.equal((await nodes(positionId)).filter((n) => n.kind === 'CONTAINER_RACK' && n.lifecycle === 'ACTIVE').length, 1);
log('Concurrent rack position is exclusive', { attempted: racks.length, succeeded: rackWins });

// Attack 2: parallel creation of Circuit Breakers in the SAME free Panel slot.
const breakers = await Promise.all(
  Array.from({ length: 16 }, (_, i) =>
    call('POST', '/api/topology', {
      kind: 'EQUIPMENT', parentId: panel.id, parentSlotIndex: 1,
      name: 'REDTEAM breaker contender ' + i, equipmentType: 'CIRCUIT_BREAKER',
    }),
  ),
);
const breakerWins = breakers.filter((r) => r.status === 201).length;
const breakerUnexpected = breakers.filter((r) => ![201, 409, 422].includes(r.status));
assert.equal(breakerUnexpected.length, 0, 'Unexpected breaker contention errors: ' + JSON.stringify(breakerUnexpected));
assert.equal(breakerWins, 1, 'Same Panel slot won more than once/no winner: ' + breakers.map((r) => r.status).join(','));
const panelRead = await call('GET', '/api/topology/' + panel.id);
assert.equal(panelRead.status, 200);
const slotId = panelRead.body.node.children[1];
assert.ok(slotId);
assert.equal((await nodes(panel.id)).filter((n) => n.id === slotId && n.lifecycle === 'ACTIVE').length, 1);
log('Concurrent breaker slot is exclusive', { attempted: breakers.length, succeeded: breakerWins });

// Attack 3: reject cross-site cookie mutations despite valid operator cookie.
const crossSite = await Promise.all(Array.from({ length: 12 }, (_, i) => call(
  'POST', '/api/topology',
  { kind: 'NETWORK', parentId: null, name: 'REDTEAM forbidden CSRF ' + i },
  { headers: { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' } },
)));
assert.ok(crossSite.every((r) => r.status === 403), JSON.stringify(crossSite.map((r) => r.status)));
assert.equal((await nodes()).length, 1, 'Cross-site write modified network inventory');
log('Cross-site mutation flood denied', { attempted: crossSite.length });

// Attack 4: malformed JSON, unsafe keys, depth and oversized body.
const payloads = [
  ['prototype pollution', '{"__proto__":{"admin":true}}', 400],
  ['invalid JSON', '{"kind":', 400],
  ['too deep', JSON.stringify({ a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }), 400],
  ['oversized JSON', JSON.stringify({ payload: 'X'.repeat(45000) }), 413],
];
for (const [name, payload, status] of payloads) {
  const r = await call('POST', '/api/topology', payload);
  assert.equal(r.status, status, name + ' returned ' + r.status + ' ' + JSON.stringify(r.body));
  log('Invalid body blocked: ' + name, { http: status });
}

// Attack 5: unknown JSON fields may not be silently accepted.
const unknown = await call('POST', '/api/topology', {
  kind: 'NETWORK', parentId: null, name: 'REDTEAM unknown keys',
  grantAdmin: true,
});
assert.equal(unknown.status, 400, JSON.stringify(unknown.body));
log('Mass assignment attempt denied');

// Attack 6: auth absence must not leak topology, even under parallel requests.
const guests = await Promise.all(Array.from({ length: 16 }, () => request('GET', '/api/topology')));
assert.ok(guests.every((r) => r.status === 401), JSON.stringify(guests.map((r) => r.status)));
log('Unauthenticated reads denied', { attempted: guests.length });

// Attack 7: service survives a bounded read burst with no 5xx.
const reads = await Promise.all(Array.from({ length: 24 }, () => call('GET', '/api/topology/' + panel.id)));
assert.ok(reads.every((r) => r.status === 200), 'Read burst status: ' + reads.map((r) => r.status).join(','));
log('Authorized read burst remains healthy', { attempted: reads.length });

console.log('[REDTEAM WHEEL COMPLETE] ' + JSON.stringify({ probes: results.length, results }));
