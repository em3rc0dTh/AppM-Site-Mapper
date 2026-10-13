#!/usr/bin/env node
/**
 * Isolated HTTP acceptance of real Next.js routes backed by an ephemeral
 * MongoDB replica set. Never point this at production or a developer DB.
 * Run only with CI_HTTP_ACCEPTANCE=true and a CI-specific DB name.
 */
import assert from 'node:assert/strict';

if (
  process.env.CI_HTTP_ACCEPTANCE !== 'true' ||
  !process.env.MONGODB_DB_NAME?.startsWith('site_mapper_http_ci_') ||
  !process.env.MONGODB_URI?.includes('127.0.0.1:27017')
) {
  throw new Error('Unsafe HTTP acceptance environment; dedicated local MongoDB required.');
}

const base = process.env.CI_HTTP_BASE_URL || 'http://127.0.0.1:3100';
const token = process.env.BOOTSTRAP_ADMIN_TOKEN;
assert.ok(token, 'Isolated admin bootstrap token required');
const email = 'mk1-e2e-operator@local.test';
const password = 'CI-Only-E2E-Strong-2026!';
const executed = [];
let cookie = '';
const record = (name, details) => {
  executed.push({ name, ...details });
  console.log('[PASS] ' + name);
};

async function request(method, path, payload, expected = 200, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await response.json().catch(() => null);
  assert.equal(
    response.status,
    expected,
    method +
      ' ' +
      path +
      ' expected HTTP ' +
      expected +
      ', received ' +
      response.status +
      ': ' +
      JSON.stringify(body),
  );
  return { body, response };
}

async function create(kind, parentId, name, extras = {}) {
  const { body } = await request('POST', '/api/topology', { kind, parentId, name, ...extras }, 201);
  assert.equal(body?.node?.kind, kind);
  assert.ok(body.node.id);
  return body.node;
}
const square = (side) => [
  { x: 0, y: 0 },
  { x: side, y: 0 },
  { x: side, y: side },
  { x: 0, y: side },
];

async function makeSite(network, label, prefix, source) {
  const site = await create('SITE', network.id, label, { polygon: square(6000) });
  const structure = await create('STRUCTURE', site.id, label + ' Structure', {
    polygon: square(5000),
  });
  const level = await create('LEVEL', structure.id, label + ' Level');
  const room = await create('ROOM_SUBSTRUCTURE', level.id, label + ' Room', {
    roomVariant: 'ROOM',
    polygon: square(4000),
  });
  const bay = await create('CONTAINER_CLUSTER_BAY', room.id, label + ' Bay', {
    clusterVariant: 'BAY',
    polygon: square(2000),
  });
  const position = await create('POSITION', bay.id, label + ' Position', {
    coordinate: { row: 'A', column: 1 },
  });
  const rack = await create('CONTAINER_RACK', position.id, label + ' Rack', {
    containerVariant: 'RACK',
    totalU: 42,
  });
  const device = await create('DEVICE', rack.id, label + ' BDFB', { deviceType: 'BDFB' });
  const panel = await create('EQUIPMENT', device.id, label + ' Panel 24P', {
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    childCapacity: 24,
    telemetryPointPrefix: prefix,
    serialNumber: source,
  });
  const breaker = await create('EQUIPMENT', panel.id, label + ' Circuit Breaker 01', {
    equipmentType: 'CIRCUIT_BREAKER',
    parentSlotIndex: 0,
  });
  const load = await create('EQUIPMENT', device.id, label + ' Load Chassis', {
    equipmentType: 'CHASSIS',
  });
  const { body: read } = await request('GET', '/api/topology/' + panel.id);
  assert.equal(read.node.telemetryPointPrefix, prefix);
  assert.equal(read.node.children.length, 24);
  assert.equal(read.node.children[0], breaker.id);
  assert.equal(read.children.length, 1);
  record(label + ': create complete physical site, rack, panel and breaker', {
    site: site.id,
    breaker: breaker.id,
  });
  return { site, rack, device, panel, breaker, load, prefix, source };
}

async function port(equipment, name, feed, direction) {
  const { body } = await request(
    'POST',
    '/api/equipment/' + equipment.id + '/access-ports',
    { port: { name, portType: 'POWER', direction, exposure: 'EXTERNAL', feed } },
    201,
  );
  assert.equal(body.port.direction, direction);
  assert.equal(body.port.attributes.feed, feed);
  return body.port.id;
}

async function connect(source, target, feed) {
  const { body } = await request(
    'POST',
    '/api/power-paths',
    { sourceAccessPortId: source, targetAccessPortId: target, feed },
    201,
  );
  assert.equal(body.path.feed, feed);
  return body.path;
}

async function main() {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {}
    if (i === 99) throw new Error('Next.js failed to start before HTTP acceptance.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const guest = await request('GET', '/api/topology', undefined, 401);
  assert.ok(guest.body.error);
  record('RBAC: anonymous topology access denied');

  await request(
    'POST',
    '/api/auth/bootstrap',
    { email, password, displayName: 'HTTP Acceptance CI Admin' },
    201,
    { authorization: 'Bearer ' + token },
  );
  const login = await request('POST', '/api/auth/login', { email, password });
  cookie = (login.response.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie.startsWith('appm_session='));
  const session = await request('GET', '/api/auth/session');
  assert.equal(session.body.user.email, email);
  record('Auth: bootstrap, login cookie and authenticated session');

  const network = await create('NETWORK', null, 'CI Two-Site Network');
  const lima = await makeSite(network, 'CI LIMA', '0_1', 'CI-BFDB-LIMA');
  const quito = await makeSite(network, 'CI QUITO', '0_2', 'CI-BFDB-QUITO');
  const { body: nodes } = await request('GET', '/api/topology?parentId=' + network.id);
  assert.deepEqual(nodes.nodes.map((n) => n.id).sort(), [lima.site.id, quito.site.id].sort());
  record('Topology: independently persisted Sites are discoverable');

  const duplicatedSerial = await request('POST', '/api/topology', {
    kind: 'EQUIPMENT', parentId: lima.device.id, name: 'Forbidden duplicate BFDB source',
    equipmentType: 'PANEL', childMode: 'POSITIONAL', childCapacity: 24,
    serialNumber: lima.source, telemetryPointPrefix: '0_1',
  }, 409);
  assert.equal(duplicatedSerial.body.error, 'SERIAL_ALREADY_ASSIGNED');
  const independentSerial = await request('POST', '/api/topology', {
    kind: 'DEVICE', parentId: quito.rack.id, name: 'Forbidden duplicate publisher',
    deviceType: 'CUSTOM', serialNumber: lima.source,
  }, 409);
  assert.equal(independentSerial.body.error, 'SERIAL_ALREADY_ASSIGNED');
  record('Active MQTT serial unique across Device, Equipment and Sites');

  const patch = await request('PATCH', '/api/topology/' + lima.panel.id, {
    action: 'configure-equipment',
    telemetryPointPrefix: '0_3',
  });
  assert.equal(patch.body.node.telemetryPointPrefix, '0_3');
  await request('PATCH', '/api/topology/' + lima.panel.id, {
    action: 'configure-equipment',
    telemetryPointPrefix: '0_1',
  });
  const { body: persisted } = await request('GET', '/api/topology/' + lima.panel.id);
  assert.equal(persisted.node.telemetryPointPrefix, '0_1');
  record('Equipment: prefix create, edit and MongoDB readback');

  const collision = await request(
    'POST',
    '/api/topology',
    {
      kind: 'EQUIPMENT',
      parentId: lima.panel.id,
      parentSlotIndex: 0,
      name: 'Forbidden duplicate breaker',
      equipmentType: 'CIRCUIT_BREAKER',
    },
    422,
  );
  assert.equal(collision.body.error, 'SLOT_OCCUPIED');
  record('Topology: occupied slot collision rejected');

  const aOut = await port(lima.breaker, 'Feed A output', 'A', 'OUTPUT');
  const bOut = await port(lima.breaker, 'Feed B output', 'B', 'OUTPUT');
  const aIn = await port(lima.load, 'Feed A input', 'A', 'INPUT');
  const bIn = await port(lima.load, 'Feed B input', 'B', 'INPUT');
  const pathA = await connect(aOut, aIn, 'A');
  const pathB = await connect(bOut, bIn, 'B');
  assert.notEqual(pathA.id, pathB.id);
  const again = await connect(aOut, aIn, 'A');
  assert.equal(again.id, pathA.id);
  const mismatch = await request(
    'POST',
    '/api/power-paths',
    { sourceAccessPortId: aOut, targetAccessPortId: bIn, feed: 'A' },
    422,
  );
  assert.equal(mismatch.body.error, 'FEED_MISMATCH');
  const { body: paths } = await request('GET', '/api/power-paths');
  assert.equal(paths.paths.length, 2);
  record('Electrical: create A/B feeds, idempotence, mismatch and persisted paths');

  // Full chain: Network > Site > ... > BDFB breaker AP > another Device's Equipment AP.
  const recipientDevice = await create('DEVICE', lima.rack.id, 'CI LIMA Second Device', {
    deviceType: 'CUSTOM',
  });
  const recipient = await create('EQUIPMENT', recipientDevice.id, 'CI LIMA Remote Load', {
    equipmentType: 'CHASSIS',
  });
  const remotePort = await port(recipient, 'Remote Equipment A input', 'A', 'INPUT');
  const secondOutput = await port(lima.breaker, 'Remote feed output A', 'A', 'OUTPUT');
  const remotePath = await connect(secondOutput, remotePort, 'A');
  assert.equal(remotePath.sourceAccessPortId, secondOutput);
  assert.equal(remotePath.targetAccessPortId, remotePort);
  const { body: physicalSource } = await request('GET', '/api/topology/' + lima.breaker.id);
  const { body: physicalTarget } = await request('GET', '/api/topology/' + recipient.id);
  assert.equal(physicalSource.node.deviceId, lima.device.id);
  assert.equal(physicalTarget.node.deviceId, recipientDevice.id);
  assert.notEqual(physicalTarget.node.deviceId, physicalSource.node.deviceId);
  const { body: physicalPaths } = await request('GET', '/api/power-paths');
  assert.ok(physicalPaths.paths.some((path) =>
    path.id === remotePath.id && path.sourceAccessPortId === secondOutput &&
      path.targetAccessPortId === remotePort));
  const { body: fullTrace } = await request('GET', '/api/power-trace/' + recipient.id);
  assert.ok(fullTrace.trace, 'Power trace did not resolve remote Equipment');
  record('Network to BDFB breaker AP to independent Device Equipment AP and power trace');

  const qOut = await port(quito.breaker, 'Quito A output', 'A', 'OUTPUT');
  const qIn = await port(quito.load, 'Quito A input', 'A', 'INPUT');
  await connect(qOut, qIn, 'A');
  const invalidTarget = await request(
    'POST',
    '/api/power-paths',
    { sourceAccessPortId: aOut, targetAccessPortId: qIn, feed: 'A' },
    422,
  );
  assert.equal(invalidTarget.body.error, 'TARGET_ALREADY_CONNECTED');
  const { body: three } = await request('GET', '/api/power-paths');
  assert.equal(three.paths.length, 4);
  record('Power: cross-site occupied target rejected');

  const { body: proposed } = await request(
    'GET',
    '/api/telemetry/panel-commissioning?panelId=' + lima.panel.id,
  );
  assert.equal(proposed.sourceIdentity, 'CI-BFDB-LIMA');
  assert.equal(proposed.pointPrefix, '0_1');
  assert.equal(proposed.rows[0].point, '0_1_1');
  assert.equal(proposed.rows[0].ready, false);
  const rejected = await request(
    'POST',
    '/api/telemetry/panel-commissioning',
    {
      panelId: lima.panel.id,
      breakerId: lima.breaker.id,
      confirmPoint: false,
      confirmSource: 'CI-BFDB-LIMA',
      confirmRawPoint: '0_1_1',
    },
    400,
  );
  assert.equal(rejected.body.error, 'CONFIRMATION_REQUIRED');
  await request('POST', '/api/telemetry/panel-commissioning', {
    panelId: lima.panel.id,
    breakerId: lima.breaker.id,
    confirmPoint: true,
    confirmSource: 'CI-BFDB-LIMA',
    confirmRawPoint: '0_1_1',
  });
  const { body: confirmed } = await request(
    'GET',
    '/api/telemetry/panel-commissioning?panelId=' + lima.panel.id,
  );
  assert.equal(confirmed.rows[0].ready, true);
  assert.equal(confirmed.rows[0].existingMetrics.length, 4);
  const { body: other } = await request(
    'GET',
    '/api/telemetry/panel-commissioning?panelId=' + quito.panel.id,
  );
  assert.equal(other.rows[0].ready, false);
  record('Commissioning: four real Mongo bindings, consent required, no cross-Site leakage');

  const wrongSource = await request(
    'POST',
    '/api/telemetry/panel-commissioning',
    {
      panelId: lima.panel.id,
      breakerId: lima.breaker.id,
      confirmPoint: true,
      confirmSource: quito.source,
      confirmRawPoint: '0_1_1',
    },
    409,
  );
  assert.equal(wrongSource.body.error, 'CONFIRMATION_MISMATCH');
  const wrongPoint = await request(
    'POST',
    '/api/telemetry/panel-commissioning',
    {
      panelId: lima.panel.id,
      breakerId: lima.breaker.id,
      confirmPoint: true,
      confirmSource: lima.source,
      confirmRawPoint: '0_2_1',
    },
    409,
  );
  assert.equal(wrongPoint.body.error, 'CONFIRMATION_MISMATCH');
  const anotherSiteBreaker = await request(
    'POST',
    '/api/telemetry/panel-commissioning',
    {
      panelId: lima.panel.id,
      breakerId: quito.breaker.id,
      confirmPoint: true,
      confirmSource: lima.source,
      confirmRawPoint: '0_1_1',
    },
    409,
  );
  assert.equal(anotherSiteBreaker.body.error, 'CONFIRMATION_MISMATCH');
  record('Adversarial commissioning: wrong source, point and cross-Site breaker rejected');

  const retry = await request('POST', '/api/telemetry/panel-commissioning', {
    panelId: lima.panel.id,
    breakerId: lima.breaker.id,
    confirmPoint: true,
    confirmSource: lima.source,
    confirmRawPoint: '0_1_1',
  });
  assert.equal(retry.body.created.length, 0, 'Repeated confirmation duplicated bindings');
  record('Adversarial idempotence: retry creates zero duplicate bindings');

  // Race 16 authenticated writes against the same uncommissioned physical slot.
  // Concurrent writes must not produce HTTP 500, partial bindings, or duplicates.
  const racingBreaker = await create('EQUIPMENT', lima.panel.id, 'CI LIMA Concurrent Breaker 02', {
    equipmentType: 'CIRCUIT_BREAKER',
    parentSlotIndex: 1,
  });
  const racePayload = {
    panelId: lima.panel.id,
    breakerId: racingBreaker.id,
    confirmPoint: true,
    confirmSource: lima.source,
    confirmRawPoint: '0_1_2',
  };
  const raceResults = await Promise.all(
    Array.from({ length: 16 }, async () => {
      const response = await fetch(base + '/api/telemetry/panel-commissioning', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(racePayload),
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    }),
  );
  assert.ok(
    raceResults.every((result) => result.status === 200 || result.status === 409),
    'Concurrent commissioning returned unexpected HTTP status: ' + JSON.stringify(raceResults),
  );
  const postRace = await request(
    'GET',
    '/api/telemetry/panel-commissioning?panelId=' + lima.panel.id,
  );
  const rowRace = postRace.body.rows.find((row) => row.breakerId === racingBreaker.id);
  assert.equal(rowRace?.ready, true, 'Concurrent writes left breaker partially commissioned');
  assert.equal(rowRace.existingMetrics.length, 4, 'Concurrent writes duplicated binding metrics');
  assert.equal(new Set(rowRace.existingMetrics).size, 4, 'Duplicate metric binding detected');
  record('Adversarial concurrency: 16 simultaneous commissioning requests remain atomic');

  if (process.env.CI_COMBINED_E2E === 'true') {
    const { execFileSync } = await import('node:child_process');
    const diag = await request('GET', '/api/telemetry/diagnostics');
    assert.equal(diag.body.enabled, true);
    for (let tries = 0; tries < 40; tries++) {
      const current = await request('GET', '/api/telemetry/diagnostics');
      if (current.body.connection === 'subscribed') break;
      assert.ok(tries !== 39, 'MQTT subscriber never obtained SUBACK');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const mqttPayload = {
      method: 'update',
      sn: lima.source,
      msgid: 900001,
      timestamp: Math.floor(Date.now() / 1000),
      reported: {
        '0_1_1': {
          state: 'ONLINE',
          U1: 13.79,
          U2: 0,
          I1: 9.91,
          I2: 0,
          P1: 136.72,
          P2: 0,
          EP1: 0.4155,
          EP2: 0,
        },
      },
    };
    execFileSync('mosquitto_pub', [
      '-h',
      '127.0.0.1',
      '-p',
      '1883',
      '-t',
      'data/dev/' + lima.source,
      '-m',
      JSON.stringify(mqttPayload),
    ]);
    let latest;
    let history;
    for (let attempt = 0; attempt < 60; attempt++) {
      const live = await request(
        'GET',
        '/api/telemetry/entity?targetId=' + lima.breaker.id + '&window=LIVE',
      );
      const prior = await request(
        'GET',
        '/api/telemetry/entity?targetId=' + lima.breaker.id + '&window=24h',
      );
      latest = live.body;
      history = prior.body;
      if (
        live.body.sample?.sourceIdentity === lima.source &&
        Array.isArray(prior.body.history) &&
        prior.body.history.length > 0
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(
      latest?.sample?.sourceIdentity,
      lima.source,
      'MQTT point did not reach breaker LIVE',
    );
    assert.ok(
      history?.history?.some((sample) => sample.sourceIdentity === lima.source),
      'TimescaleDB history does not include commissioned breaker sample',
    );
    const quitoLive = await request(
      'GET',
      '/api/telemetry/entity?targetId=' + quito.breaker.id + '&window=LIVE',
    );
    assert.ok(quitoLive.body.sample == null, 'LIVE data leaked into unrelated Site');
    record('Broker to MQTT subscriber to commissioned breaker LIVE');
    record('TimescaleDB durable breaker history and second-Site isolation');

    const { body: diagAfter } = await request('GET', '/api/telemetry/diagnostics');
    assert.ok(diagAfter.acceptedMessages >= 1);
    assert.ok(diagAfter.history.writes >= 1);
    assert.equal(diagAfter.history.failures, 0);
    record('Telemetry diagnostics: accepted MQTT and successful time-series writes');
  }

  const { body: networks } = await request('GET', '/api/topology');
  assert.equal(networks.nodes.length, 1);
  record('Final: isolated MongoDB inventory survives independent HTTP readback');

  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        checks: executed.length,
        mongoDatabase: process.env.MONGODB_DB_NAME,
        sites: 2,
        activePowerPaths: three.paths.length,
        commissionedBreakers: 1,
        metricsOnCommissionedBreaker: 4,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error('[FAIL] ' + error.message);
  process.exitCode = 1;
});
