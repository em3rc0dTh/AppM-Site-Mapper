#!/usr/bin/env node
import assert from 'node:assert/strict';

if (
  process.env.CI_COMBINED_E2E !== 'true' ||
  !process.env.MONGODB_DB_NAME?.startsWith('site_mapper_http_ci_') ||
  !process.env.MONGODB_URI?.includes('127.0.0.1:27017')
) {
  throw new Error('Restart check requires isolated disposable MongoDB');
}

const base = process.env.CI_HTTP_BASE_URL || 'http://127.0.0.1:3100';
const cookie = await (async () => {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    if (i === 89) throw new Error('Next.js did not restart');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'mk1-e2e-operator@local.test',
      password: 'CI-Only-E2E-Strong-2026!',
    }),
  });
  assert.equal(login.status, 200, 'Login failed after application restart');
  return (login.headers.get('set-cookie') || '').split(';')[0];
})();
assert.ok(cookie.startsWith('appm_session='));

async function get(path) {
  const response = await fetch(base + path, {
    headers: { cookie },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
const roots = await get('/api/topology');
assert.equal(roots.nodes.length, 1);
const network = roots.nodes[0];
const sites = await get('/api/topology?parentId=' + network.id);
assert.equal(sites.nodes.length, 2);

async function descendants(id) {
  const { nodes } = await get('/api/topology?parentId=' + id);
  const collected = [...nodes];
  for (const node of nodes) collected.push(...(await descendants(node.id)));
  return collected;
}
const all = await descendants(network.id);
const panel = all.find((node) => node.name === 'CI LIMA Panel 24P');
const breaker = all.find((node) => node.name === 'CI LIMA Circuit Breaker 01');
assert.ok(panel && breaker, 'Saved panel or breaker missing after restart');
assert.equal(panel.telemetryPointPrefix, '0_1');
const power = await get('/api/power-paths');
assert.equal(power.paths.length, 4);
const recipient = all.find((node) => node.name === 'CI LIMA Remote Load');
const recipientDevice = all.find((node) => node.name === 'CI LIMA Second Device');
assert.ok(recipient && recipientDevice, 'Remote Equipment or owner Device lost on restart');
assert.equal(recipient.deviceId, recipientDevice.id);
assert.notEqual(recipient.deviceId, breaker.deviceId);
const remoteOut = breaker.accessPorts.find((port) => port.name === 'Remote feed output A');
const remoteIn = recipient.accessPorts.find((port) => port.name === 'Remote Equipment A input');
assert.ok(remoteOut && remoteIn, 'Remote AccessPorts not persisted');
const physicalRemote = power.paths.find(
  (path) =>
    path.sourceAccessPortId === remoteOut.id &&
    path.targetAccessPortId === remoteIn.id &&
    path.feed === 'A',
);
assert.ok(physicalRemote, 'Exact cross-Device BDFB power path lost after restart');
const trace = await get('/api/power-trace/' + recipient.id);
const leg = trace.trace.legs.find((candidate) => candidate.pathId === physicalRemote.id);
assert.equal(leg?.topologyStatus, 'VALID');
assert.equal(leg?.source.breakerId, breaker.id);
assert.equal(leg?.target.accessPort.id, remoteIn.id);
const commissioning = await get('/api/telemetry/panel-commissioning?panelId=' + panel.id);
assert.equal(commissioning.rows[0].ready, true);
const history = await get('/api/telemetry/entity?targetId=' + breaker.id + '&window=24h');
assert.ok(
  Array.isArray(history.history) &&
    history.history.some((sample) => sample.sourceIdentity === 'CI-BFDB-LIMA'),
  'Timescale history not durable across restart',
);
const bdfb = all.find((node) => node.name === 'CI LIMA BDFB');
const chassis = all.find((node) => node.name === 'CI LIMA Load Chassis');
assert.ok(bdfb && chassis, 'BDFB or chassis not recovered after restart');
const snmpPorts = chassis.accessPorts.filter((port) => port.attributes?.snmpFeedInput === true);
assert.equal(snmpPorts.length, 2, 'SNMP input-feed inventory lost after restart');
const recoveredFeeds = await get('/api/telemetry/snmp/feeds?deviceId=' + bdfb.id);
assert.equal(recoveredFeeds.feedCount, 2);
assert.equal(recoveredFeeds.feeds.filter((feed) => feed.currentOid).length, 2);
const snmpAfterRestartHistory = await get(
  '/api/telemetry/snmp/feeds/history?feedAccessPortId=' + snmpPorts[0].id + '&window=24h',
);
assert.ok(
  snmpAfterRestartHistory.samples.some((sample) => sample.sourceIdentity === 'CI-SNMP-LIMA'),
  'SNMP TimescaleDB history missing after process restart',
);
const historicSnmp = snmpAfterRestartHistory.samples.find(
  (sample) => sample.sourceIdentity === 'CI-SNMP-LIMA' &&
    sample.reported?.currentA?.observedAt,
);
assert.ok(historicSnmp, 'Cannot locate persisted SNMP current observation');
const replay = await fetch(base + '/api/telemetry/snmp/ingest', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: 'Bearer ' + process.env.SNMP_INGEST_TOKEN,
  },
  body: JSON.stringify({
    schemaVersion: 1,
    sourceIdentity: 'CI-SNMP-LIMA',
    observedAt: historicSnmp.reported.currentA.observedAt,
    measurements: [{
      oid: historicSnmp.reported.currentA.oid,
      metric: 'CURRENT',
      unit: 'A',
      value: 79999,
    }],
  }),
});
assert.equal(replay.status, 422,
  'Restart allowed an authenticated replay to replace persisted SNMP current');
console.log('[PASS] SNMP old observation cannot be tampered with after Next.js restart');

console.log('[PASS] SNMP independent-feeder mappings and TimescaleDB history survive restart');
console.log(
  '[PASS] Restart: both Sites, 4 power paths including cross-Device AP, commissioned breaker and TimescaleDB history restored',
);
