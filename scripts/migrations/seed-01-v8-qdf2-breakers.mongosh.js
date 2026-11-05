// Seed-01 v8 in-place QDF-2 topology reconciliation.
//
// Scope: physical breaker inventory only. This migration intentionally does NOT
// create MQTT metric bindings, breaker ratings or alarm policies. Runtime MQTT
// point bindings are reconciled by Site Mapper when telemetry matches an
// existing breaker.
//
// Plan (read-only):
//   docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet seed-01 \
//     < scripts/migrations/seed-01-v8-qdf2-breakers.mongosh.js
//
// Apply:
//   docker exec -i -e SITEMAPPER_SEED01_V8_QDF2_MODE=apply \
//     -e SITEMAPPER_SEED01_V8_QDF2_ACK=APPLY \
//     appm-site-mapper-mongodb-1 mongosh --quiet seed-01 \
//     < scripts/migrations/seed-01-v8-qdf2-breakers.mongosh.js

const DATABASE = 'seed-01';
const MODE = process.env.SITEMAPPER_SEED01_V8_QDF2_MODE || 'plan';
const ACK = process.env.SITEMAPPER_SEED01_V8_QDF2_ACK || '';

function assert(value, message) {
  if (!value) throw new Error('SEED01_V8_QDF2_BLOCKED: ' + message);
}
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
assert(['plan', 'apply'].includes(MODE), 'mode must be plan or apply');
assert(db.getName() === DATABASE, 'this migration only targets seed-01');
if (MODE === 'apply') assert(ACK === 'APPLY', 'set SITEMAPPER_SEED01_V8_QDF2_ACK=APPLY');

const d = db.getSiblingDB(DATABASE);
const state = d.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
assert(state, 'seed-01 state not found');
assert(state.version >= 4 && state.version <= 8, 'unsupported seed-01 version');
assert(Array.isArray(state.bdfbs) && state.bdfbs.length === 3, 'expected exactly 3 BDFBs');

const schedule = [
  { row: 1, a: { pos: 2, destination: 'GRTLuren3 PSU0 A0', legacyPanel: 'A1', legacyPos: 1 }, b: { pos: 2, destination: 'GRTLuren3 PSU0 B0', legacyPanel: 'B1', legacyPos: 1 } },
  { row: 2, a: { pos: 3, destination: 'GRTLuren3 PSU0 A1', legacyPanel: 'A1', legacyPos: 2 }, b: { pos: 3, destination: 'GRTLuren3 PSU0 B1', legacyPanel: 'B1', legacyPos: 2 } },
  { row: 3, a: { pos: 4, destination: 'GRTLuren3 PSU1 A0', legacyPanel: 'A1', legacyPos: 3 }, b: { pos: 4, destination: 'GRTLuren3 PSU1 B0', legacyPanel: 'B1', legacyPos: 3 } },
  { row: 4, a: { pos: 1, destination: 'Rack CDN PDU-1A', legacyPanel: 'A1', legacyPos: 4 }, b: { pos: 1, destination: 'Rack CDN PDU-1B', legacyPanel: 'B1', legacyPos: 4 } },
  { row: 5, a: { pos: 5, destination: 'GRTLuren3 PSU1 A1', legacyPanel: 'A2', legacyPos: 1 }, b: { pos: 5, destination: 'GRTLuren3 PSU1 B1', legacyPanel: 'B2', legacyPos: 1 } },
  { row: 6, a: { pos: 6, destination: 'GRTLuren3 PSU2 A0', legacyPanel: 'A2', legacyPos: 2 }, b: { pos: 6, destination: 'GRTLuren3 PSU2 B0', legacyPanel: 'B2', legacyPos: 2 } },
  { row: 7, a: { pos: 7, destination: 'GRTLuren3 PSU2 A1', legacyPanel: 'A2', legacyPos: 3 }, b: { pos: 7, destination: 'GRTLuren3 PSU2 B1', legacyPanel: 'B2', legacyPos: 3 } },
  { row: 8, a: { pos: 8, destination: 'DTX-LUR-FP2-01 SH15 PEM A1.1', legacyPanel: 'A2', legacyPos: 6 }, b: { pos: 8, destination: 'DTX-LUR-FP2-01 SH15 PEM B1.1', legacyPanel: 'B2', legacyPos: 6 } },
  { row: 9, a: { pos: 9, destination: 'DTX-LUR-FP2-01 SH15 PEM A1.2', legacyPanel: 'A2', legacyPos: 7 }, b: { pos: 9, destination: 'DTX-LUR-FP2-01 SH15 PEM B1.2', legacyPanel: 'B2', legacyPos: 7 } },
  { row: 10, a: { pos: 10, destination: 'DTX-LUR-FP2-01 SH15 PEM A2.1', legacyPanel: 'A2', legacyPos: 8 }, b: { pos: 10, destination: 'DTX-LUR-FP2-01 SH15 PEM B2.1', legacyPanel: 'B2', legacyPos: 8 } },
  { row: 11, a: { pos: 11, destination: 'DTX-LUR-FP2-01 SH15 PEM A2.2', legacyPanel: 'A2', legacyPos: 14 }, b: { pos: 11, destination: 'DTX-LUR-FP2-01 SH15 PEM B2.2', legacyPanel: 'B2', legacyPos: 14 } },
  { row: 12, a: { pos: 12, destination: 'DTX-LUR-FP2-01 SH15 PEM A3.1', legacyPanel: 'A2', legacyPos: 15 }, b: { pos: 12, destination: 'DTX-LUR-FP2-01 SH15 PEM B3.1', legacyPanel: 'B2', legacyPos: 15 } },
  { row: 13, a: { pos: 13, destination: 'DTX-LUR-FP2-01 SH15 PEM A3.2', legacyPanel: 'A2', legacyPos: 16 }, b: { pos: 13, destination: 'DTX-LUR-FP2-01 SH15 PEM B3.2', legacyPanel: 'B2', legacyPos: 16 } },
];

const qdf2 = d.topology_nodes.findOne({
  kind: 'DEVICE',
  lifecycle: 'ACTIVE',
  deviceType: 'BDFB',
  name: 'BDFB QDF-2',
});
assert(qdf2, 'BDFB QDF-2 not found');

function exactlyOnePanel(name) {
  const rows = d.topology_nodes
    .find({
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      deviceId: qdf2.id,
      equipmentType: 'PANEL',
      name,
    })
    .toArray();
  assert(rows.length === 1, 'QDF-2 requires exactly one panel ' + name);
  assert(Array.isArray(rows[0].children) && rows[0].children.length === 24, name + ' must expose 24 positions');
  return rows[0];
}

const a3 = exactlyOnePanel('A3');
const b3 = exactlyOnePanel('B3');

const desired = [];
for (const item of schedule) {
  desired.push({ side: 'A', row: item.row, panel: 'A3', ...item.a });
  desired.push({ side: 'B', row: item.row, panel: 'B3', ...item.b });
}

const existingRows = [];
let missing = 0;
for (const item of desired) {
  const panel = item.panel === 'A3' ? a3 : b3;
  const id = panel.children[item.pos - 1];
  if (!id) {
    missing += 1;
    existingRows.push({ panel: item.panel, position: item.pos, status: 'CREATE', destination: item.destination });
    continue;
  }
  const breaker = d.topology_nodes.findOne({ id });
  assert(breaker, item.panel + '-' + item.pos + ' contains dangling child id');
  const expectedName = item.panel + '-' + String(item.pos).padStart(2, '0');
  assert(
    breaker.kind === 'EQUIPMENT' &&
      breaker.lifecycle === 'ACTIVE' &&
      breaker.equipmentType === 'CIRCUIT_BREAKER' &&
      breaker.deviceId === qdf2.id &&
      breaker.parentEquipmentId === panel.id &&
      breaker.parentId === panel.id &&
      breaker.name === expectedName,
    item.panel + '-' + item.pos + ' is occupied by incompatible topology',
  );
  existingRows.push({
    panel: item.panel,
    position: item.pos,
    status: 'EXISTS',
    id: breaker.id,
    name: breaker.name,
    destination: item.destination,
  });
}

const outsideDesired = [];
for (const panel of [a3, b3]) {
  for (let i = 0; i < panel.children.length; i += 1) {
    const id = panel.children[i];
    if (!id) continue;
    if (!desired.some((x) => x.panel === panel.name && x.pos === i + 1)) {
      outsideDesired.push({ panel: panel.name, position: i + 1, id });
    }
  }
}
assert(outsideDesired.length === 0, 'QDF-2 has unexpected occupied A3/B3 positions: ' + JSON.stringify(outsideDesired));

printjson({
  mode: MODE,
  qdf: 'QDF-2',
  desiredBreakers: desired.length,
  existingBreakers: desired.length - missing,
  createBreakers: missing,
  targetPositions: { A3: '1..13', B3: '1..13' },
  createsTelemetryBindings: false,
  createsRatings: false,
  createsAlarmPolicies: false,
  rows: existingRows,
});

if (MODE === 'plan') {
  print('PLAN ONLY, 0 writes.');
  quit(0);
}

const session = d.getMongo().startSession();
let created = 0;
let updatedEvidence = 0;
try {
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  const tx = session.getDatabase(DATABASE);
  const topology = tx.topology_nodes;
  const now = new Date().toISOString();
  const panels = {
    A3: topology.findOne({ id: a3.id, lifecycle: 'ACTIVE' }),
    B3: topology.findOne({ id: b3.id, lifecycle: 'ACTIVE' }),
  };
  assert(panels.A3 && panels.B3, 'QDF-2 panels disappeared during transaction');

  const ids = new Map();
  for (const item of desired) {
    const panel = panels[item.panel];
    const slot = item.pos - 1;
    const expectedName = item.panel + '-' + String(item.pos).padStart(2, '0');
    let id = panel.children[slot];

    if (id) {
      const current = topology.findOne({ id, lifecycle: 'ACTIVE' });
      assert(
        current &&
          current.kind === 'EQUIPMENT' &&
          current.equipmentType === 'CIRCUIT_BREAKER' &&
          current.deviceId === qdf2.id &&
          current.parentEquipmentId === panel.id &&
          current.parentId === panel.id &&
          current.name === expectedName,
        expectedName + ' changed during migration',
      );
    } else {
      id = uuidv4();
      topology.insertOne({
        id,
        parentId: panel.id,
        name: expectedName,
        lifecycle: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        kind: 'EQUIPMENT',
        deviceId: qdf2.id,
        equipmentType: 'CIRCUIT_BREAKER',
        parentEquipmentId: panel.id,
        childMode: 'DYNAMIC',
        children: [],
        accessPorts: [
          {
            id: id + ':power-out',
            deviceId: qdf2.id,
            equipmentId: id,
            name: 'Power output',
            portType: 'POWER',
            direction: 'OUTPUT',
            exposure: 'EXTERNAL',
            lifecycle: 'ACTIVE',
          },
        ],
        pinned: false,
        aliases: [item.destination],
        category: '48 VDC feeder',
        revision: 1,
        attributes: {},
      });
      panel.children[slot] = id;
      created += 1;
    }
    ids.set(item.side + ':' + item.row, id);
  }

  for (const name of ['A3', 'B3']) {
    const original = name === 'A3' ? a3 : b3;
    const panel = panels[name];
    if (JSON.stringify(panel.children) !== JSON.stringify(original.children)) {
      const revisionFilter =
        original.revision === undefined
          ? { revision: { $exists: false } }
          : { revision: original.revision };
      const result = topology.updateOne(
        { id: panel.id, lifecycle: 'ACTIVE', ...revisionFilter },
        { $set: { children: panel.children, updatedAt: now }, $inc: { revision: 1 } },
      );
      assert(result.matchedCount === 1, name + ' positional update lost race');
    }
  }

  for (const item of desired) {
    const id = ids.get(item.side + ':' + item.row);
    const companionSide = item.side === 'A' ? 'B' : 'A';
    const companion = desired.find((x) => x.row === item.row && x.side === companionSide);
    assert(companion, 'missing companion for source row ' + item.row);
    const companionId = ids.get(companionSide + ':' + item.row);
    assert(companionId, 'missing companion breaker id for source row ' + item.row);

    const current = topology.findOne({ id, lifecycle: 'ACTIVE' });
    assert(current, 'breaker disappeared during evidence update');
    const declaredPower = {
      contractVersion: 1,
      state: 'DECLARED',
      sourceDocument: 'Lista de Equipos QDF mop 1 - actualizado',
      qdf: 'QDF-2',
      sourceRow: item.row,
      pairId: 'seed01:QDF-2:row:' + item.row,
      feed: item.side,
      targetLabel: item.destination,
      currentBreaker: { panel: item.panel, position: item.pos },
      legacyBreaker: { panel: item.legacyPanel, position: item.legacyPos },
      companionFeed: {
        feed: companionSide,
        breakerId: companionId,
        panel: companion.panel,
        position: companion.pos,
        targetLabel: companion.destination,
      },
      remarks: [],
      targetPlacement: 'UNKNOWN',
      targetMaterialization: 'NOT_CREATED',
    };
    const expectedAliases = [item.destination];

    if (
      JSON.stringify(current.aliases || []) !== JSON.stringify(expectedAliases) ||
      current.category !== '48 VDC feeder' ||
      JSON.stringify(current.attributes?.declaredPower) !== JSON.stringify(declaredPower)
    ) {
      topology.updateOne(
        { id: current.id, lifecycle: 'ACTIVE' },
        {
          $set: {
            aliases: expectedAliases,
            category: '48 VDC feeder',
            'attributes.declaredPower': declaredPower,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
      );
      updatedEvidence += 1;
    }
  }

  const counts = {};
  for (const row of state.bdfbs) {
    const device = topology.findOne({ id: row.deviceId, kind: 'DEVICE', lifecycle: 'ACTIVE' });
    assert(device, 'seed state references missing device ' + row.key);
    counts[row.key] = topology.countDocuments({
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      deviceId: device.id,
      equipmentType: 'CIRCUIT_BREAKER',
      'attributes.declaredPower.qdf': row.key,
    });
  }
  assert(counts['QDF-2'] === 26, 'QDF-2 expected 26 declared breakers; found ' + counts['QDF-2']);
  assert(counts['QDF-4'] === 12, 'QDF-4 expected 12 declared breakers; found ' + counts['QDF-4']);
  assert(counts['QDF-5'] === 36, 'QDF-5 expected 36 declared breakers; found ' + counts['QDF-5']);

  const nextBdfbs = state.bdfbs.map((row) => ({ ...row, breakerCount: counts[row.key] }));
  tx.runtime_seed_state.updateOne(
    { _id: 'seed-01', status: 'APPLIED' },
    {
      $set: {
        version: 8,
        bdfbs: nextBdfbs,
        updatedAt: now,
        qdf2BreakerMigration: 'POST_MIGRATION_POSITIONS_DECLARED',
      },
    },
  );

  session.commitTransaction();
  printjson({
    status: 'SEED01_V8_QDF2_APPLIED',
    qdf2BreakersCreated: created,
    evidenceUpdated: updatedEvidence,
    breakerCounts: counts,
    telemetryBindingMode: 'AUTOMATIC_RUNTIME_RECONCILIATION',
    subEquipmentSemantics: 'REMARK_ONLY',
  });
} catch (error) {
  try {
    session.abortTransaction();
  } catch (_) {}
  throw error;
} finally {
  session.endSession();
}
