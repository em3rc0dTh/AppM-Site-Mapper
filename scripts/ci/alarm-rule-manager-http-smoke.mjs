import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.ALARM_RULE_TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const email = process.env.LOCAL_ADMIN_EMAIL ?? 'alarm-ci@local.test';
const password = process.env.LOCAL_ADMIN_PASSWORD;
const results = [];
if (!password) throw new Error('LOCAL_ADMIN_PASSWORD must be set for disposable CI lab');

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', cache: 'no-store', ...options });
  if (response.status !== expectedStatus) {
    const detail = (await response.text()).slice(0, 600);
    throw new Error(`HTTP ${path}: expected ${expectedStatus}, received ${response.status}: ${detail}`);
  }
  return response;
}
async function check(name, run) {
  await run();
  results.push({ name, status: 'PASS' });
  console.log('PASS ' + name);
}
function jsonAction(cookie, action) {
  return {
    method: 'POST',
    headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify(action),
  };
}
const start = Date.now();
let ready = false;
while (Date.now() - start < 120_000) {
  try {
    const r = await fetch(new URL('/api/health', base));
    if (r.ok) { ready = true; break; }
  } catch {
    // Application is booting.
  }
  await new Promise((r) => setTimeout(r, 1000));
}
assert.ok(ready, 'Site Mapper health endpoint was unavailable');

await check('unauthenticated catalog is denied', async () => {
  const r = await request('/api/alarms/rules', {}, 401);
  assert.equal((await r.json()).error, 'SESSION_INVALID');
});
await check('unauthenticated policy mutation is denied', async () => {
  await request('/api/alarms/rules', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'SAVE_DRAFT', rule: {} }),
  }, 403);
});
let cookie = '';
await check('administrator authentication creates session cookie', async () => {
  const login = await request('/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = login.headers.get('set-cookie') ?? '';
  cookie = setCookie.split(';')[0] ?? '';
  assert.ok(cookie.includes('='), 'No session cookie returned');
});
await check('authenticated Rule Manager page and Alarm Center render', async () => {
  for (const page of ['/alarms/rules', '/alarms']) {
    const response = await request(page, { headers: { cookie } });
    const html = await response.text();
    assert.ok(html.includes('<html') && html.length > 1000, page + ' missing page HTML');
  }
});
await check('Rule Manager API exposes 48V profile and V/A/P/E rule codes', async () => {
  const data = await (await request('/api/alarms/rules', { headers: { cookie } })).json();
  assert.equal(data.profile.id, 'DC-48V-24CELL');
  assert.equal(data.profile.referenceVoltageV, 54.5);
  assert.equal(data.profile.boostVoltageV, 56.5);
  assert.equal(data.profile.rectifierOvsV, 59);
  assert.equal(data.profile.voltageLimitsCommissioned, false);
  for (const code of ['LOW_VOLTAGE','HIGH_VOLTAGE','LOAD_LOSS','LOW_POWER','ENERGY_COUNTER_RESET']) {
    assert.ok(data.managedCodes.includes(code), 'Missing rule code ' + code);
  }
});
const draft = {
  code: 'LOW_CURRENT', scope: 'GLOBAL', scopeId: null,
  electricalProfileId: 'DC-48V-24CELL',
  parameters: { assertBelowA: 1, clearAboveA: 2 },
  severity: 'WARNING', debounceSamples: 2, recoverySamples: 2,
};
let record;
await check('same-origin admin saves an isolated draft', async () => {
  const response = await request('/api/alarms/rules', jsonAction(cookie, { action: 'SAVE_DRAFT', rule: draft }));
  record = (await response.json()).record;
  assert.equal(record.revision, 1);
  assert.equal(record.draft.status, 'DRAFT');
  assert.equal(record.published, null);
});
await check('cross-site policy mutation is rejected', async () => {
  const req = jsonAction(cookie, { action: 'PUBLISH', id: record.id, expectedRevision: record.revision, confirmImpact: true });
  req.headers.origin = 'https://attacker.example';
  req.headers['sec-fetch-site'] = 'cross-site';
  await request('/api/alarms/rules', req, 403);
});
await check('publication requires explicit operator impact confirmation', async () => {
  const response = await request('/api/alarms/rules', jsonAction(cookie, {
    action: 'PUBLISH', id: record.id, expectedRevision: record.revision,
  }), 400);
  assert.equal((await response.json()).error, 'RULE_IMPACT_CONFIRMATION_REQUIRED');
});
await check('admin publishes reviewed rule, producing a new immutable revision', async () => {
  const response = await request('/api/alarms/rules', jsonAction(cookie, {
    action: 'PUBLISH', id: record.id, expectedRevision: record.revision, confirmImpact: true,
  }));
  record = (await response.json()).record;
  assert.equal(record.published.status, 'PUBLISHED');
  assert.equal(record.revision, 2);
});
await check('a draft change does not silently overwrite the published policy', async () => {
  const response = await request('/api/alarms/rules', jsonAction(cookie, {
    action: 'SAVE_DRAFT', rule: {
      ...draft, id: record.id, expectedRevision: record.revision,
      parameters: { assertBelowA: 1.5, clearAboveA: 2.5 },
    },
  }));
  record = (await response.json()).record;
  assert.equal(record.draft.parameters.assertBelowA, 1.5);
  assert.equal(record.published.parameters.assertBelowA, 1);
  assert.equal(record.revision, 3);
});
await check('stale writes fail with conflict instead of overwriting changes', async () => {
  const response = await request('/api/alarms/rules', jsonAction(cookie, {
    action: 'DISABLE', id: record.id, expectedRevision: 2,
  }), 409);
  assert.equal((await response.json()).error, 'RULE_STALE_WRITE');
});
await check('disabling published rule preserves the complete audit trail', async () => {
  const response = await request('/api/alarms/rules', jsonAction(cookie, {
    action: 'DISABLE', id: record.id, expectedRevision: record.revision,
  }));
  record = (await response.json()).record;
  assert.equal(record.published, null);
  assert.deepEqual(record.audit.map((a) => a.action), [
    'CREATED', 'PUBLISHED', 'DRAFT_UPDATED', 'DISABLED',
  ]);
});
await check('invalid breaker ID is rejected with bounded error', async () => {
  const response = await request('/api/alarms/rules/effective', { headers: { cookie } }, 400);
  assert.equal((await response.json()).error, 'INVALID_BREAKER_ID');
});
const output = resolve('artifacts/alarm-rule-manager/http-acceptance.json');
await mkdir(resolve('artifacts/alarm-rule-manager'), { recursive: true });
await writeFile(output, JSON.stringify({ base, generatedAt: new Date().toISOString(), results }, null, 2) + '\n');
console.log(`HTTP ACCEPTANCE PASS: ${results.length} checks; receipt at ${output}`);
