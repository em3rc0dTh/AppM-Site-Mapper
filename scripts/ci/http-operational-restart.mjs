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
const physicalRemote = power.paths.find(
  (path) =>
    path.sourceAccessPortId &&
    path.targetAccessPortId &&
    path.sourceAccessPortId !== path.targetAccessPortId,
);
assert.ok(physicalRemote, 'Missing persisted AccessPort-to-AccessPort path');
const commissioning = await get('/api/telemetry/panel-commissioning?panelId=' + panel.id);
assert.equal(commissioning.rows[0].ready, true);
const history = await get('/api/telemetry/entity?targetId=' + breaker.id + '&window=24h');
assert.ok(
  Array.isArray(history.history) &&
    history.history.some((sample) => sample.sourceIdentity === 'CI-BFDB-LIMA'),
  'Timescale history not durable across restart',
);
console.log(
  '[PASS] Restart: both Sites, 3 power paths, commissioned breaker and TimescaleDB history restored',
);
