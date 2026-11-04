// Seed-01 v8 in-place laboratory migration.
// Adds the now-confirmed QDF-2 post-migration breaker schedule, applies a
// provisional 20 A standard rating to all 74 declared breakers, commissions
// QDF-2 MQTT point bindings, and derives OVERCURRENT policies from ratedCurrentA.
//
// SUB-EQUIPO remains evidence/remark only. No remote target Equipment is created.
//
// Run only against the current seed-01 lab:
// docker exec -i -e SITEMAPPER_SEED01_V8_ACK=APPLY \
//   appm-site-mapper-mongodb-1 mongosh --quiet seed-01 \
//   < scripts/migrations/seed-01-v8-qdf2-breakers-rated-current.mongosh.js

const DATABASE = 'seed-01';
const ACK = process.env.SITEMAPPER_SEED01_V8_ACK || '';
const STANDARD_RATED_CURRENT_A = 20;
const RATING_SOURCE = 'PROVISIONAL_STANDARD';
const RATING_REFERENCE = 'seed-01-v8 temporary standard until field rating is verified';
const QDF2_SOURCE = '26092403950003';
const PANEL_GROUP = { A3: 1, B3: 3 };
const METRICS = [
  { metric: 'VOLTAGE', unit: 'V' },
  { metric: 'CURRENT', unit: 'A' },
  { metric: 'POWER', unit: 'W' },
  { metric: 'ENERGY', unit: 'kWh' },
];

function assert(value, message) {
  if (!value) throw new Error('SEED01_V8_BLOCKED: ' + message);
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function standardRating(current) {
  const attrs = current.attributes || {};
  const existing = attrs.ratedCurrentA;
  const provenance = attrs.ratedCurrentProvenance;
  const hasOperatorRating =
    typeof existing === 'number' &&
    Number.isFinite(existing) &&
    existing > 0 &&
    (!provenance ||
      typeof provenance !== 'object' ||
      provenance.source !== RATING_SOURCE);

  return {
    ratedCurrentA: hasOperatorRating ? existing : STANDARD_RATED_CURRENT_A,
    ratedCurrentProvenance: hasOperatorRating
      ? provenance
      : {
          source: RATING_SOURCE,
          verified: false,
          reference: RATING_REFERENCE,
        },
  };
}

assert(ACK === 'APPLY', 'set SITEMAPPER_SEED01_V8_ACK=APPLY');
assert(db.getName() === DATABASE, 'this migration only targets seed-01');

const d = db.getSiblingDB(DATABASE);
const state = d.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
assert(state, 'seed-01 state not found');
assert(state.version >= 7 && state.version <= 8, 'expected seed-01 v7/v8');
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

const a3 = d.topology_nodes.findOne({
  kind: 'EQUIPMENT',
  lifecycle: 'ACTIVE',
  deviceId: qdf2.id,
  equipmentType: 'PANEL',
  name: 'A3',
});
const b3 = d.topology_nodes.findOne({
  kind: 'EQUIPMENT',
  lifecycle: 'ACTIVE',
  deviceId: qdf2.id,
  equipmentType: 'PANEL',
  name: 'B3',
});
assert(a3 && b3, 'QDF-2 A3/B3 panels are required');
assert(Array.isArray(a3.children) && a3.children.length === 24, 'QDF-2 A3 must expose 24 positions');
assert(Array.isArray(b3.children) && b3.children.length === 24, 'QDF-2 B3 must expose 24 positions');

const session = d.getMongo().startSession();
let createdBreakers = 0;
let insertedBindings = 0;
let updatedRatings = 0;
let upsertedPolicies = 0;

try {
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  const tx = session.getDatabase(DATABASE);
  const topology = tx.topology_nodes;
  const bindings = tx.telemetry_bindings;
  const policies = tx.alarm_policies;
  const now = new Date().toISOString();

  const panels = {
    A3: topology.findOne({ id: a3.id, lifecycle: 'ACTIVE' }),
    B3: topology.findOne({ id: b3.id, lifecycle: 'ACTIVE' }),
  };
  assert(panels.A3 && panels.B3, 'QDF-2 panels disappeared during transaction');

  const idsBySideRow = new Map();

  function ensureBreaker(panelName, pos, destination, row, side) {
    const panel = panels[panelName];
    const slot = pos - 1;
    const expectedName = panelName + '-' + String(pos).padStart(2, '0');
    const existingId = panel.children[slot];

    if (existingId) {
      const existing = topology.findOne({ id: existingId });
      assert(existing, expectedName + ' child identity is dangling');
      assert(existing.kind === 'EQUIPMENT', expectedName + ' is not Equipment');
      assert(existing.lifecycle === 'ACTIVE', expectedName + ' is not active');
      assert(existing.equipmentType === 'CIRCUIT_BREAKER', expectedName + ' is not a breaker');
      assert(existing.parentEquipmentId === panel.id, expectedName + ' parent mismatch');
      assert(existing.name === expectedName, expectedName + ' slot already has incompatible name');
      idsBySideRow.set(side + ':' + row, existing.id);
      return existing.id;
    }

    const id = uuidv4();
    const node = {
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
      aliases: [destination],
      category: '48 VDC feeder',
      revision: 1,
      attributes: {},
    };
    topology.insertOne(node);
    panel.children[slot] = id;
    idsBySideRow.set(side + ':' + row, id);
    createdBreakers += 1;
    return id;
  }

  for (const item of schedule) {
    ensureBreaker('A3', item.a.pos, item.a.destination, item.row, 'A');
    ensureBreaker('B3', item.b.pos, item.b.destination, item.row, 'B');
  }

  for (const panelName of ['A3', 'B3']) {
    const original = panelName === 'A3' ? a3 : b3;
    const panel = panels[panelName];
    if (JSON.stringify(panel.children) !== JSON.stringify(original.children)) {
      const result = topology.updateOne(
        { id: panel.id, lifecycle: 'ACTIVE', revision: original.revision },
        {
          $set: { children: panel.children, updatedAt: now },
          $inc: { revision: 1 },
        },
      );
      assert(result.matchedCount === 1, panelName + ' positional update lost race');
    }
  }

  for (const item of schedule) {
    for (const side of ['A', 'B']) {
      const spec = side === 'A' ? item.a : item.b;
      const panelName = side === 'A' ? 'A3' : 'B3';
      const id = idsBySideRow.get(side + ':' + item.row);
      const companionSide = side === 'A' ? 'B' : 'A';
      const companionSpec = side === 'A' ? item.b : item.a;
      const companionId = idsBySideRow.get(companionSide + ':' + item.row);
      const current = topology.findOne({ id, lifecycle: 'ACTIVE' });
      assert(current, 'breaker disappeared ' + panelName + '-' + spec.pos);

      const rating = standardRating(current);
      const declaredPower = {
        contractVersion: 1,
        state: 'DECLARED',
        sourceDocument: 'Lista de Equipos QDF mop 1 - actualizado',
        qdf: 'QDF-2',
        sourceRow: item.row,
        pairId: 'seed01:QDF-2:row:' + item.row,
        feed: side,
        targetLabel: spec.destination,
        currentBreaker: { panel: panelName, position: spec.pos },
        legacyBreaker: { panel: spec.legacyPanel, position: spec.legacyPos },
        companionFeed: {
          feed: companionSide,
          breakerId: companionId,
          panel: companionSide === 'A' ? 'A3' : 'B3',
          position: companionSpec.pos,
          targetLabel: companionSpec.destination,
        },
        remarks: [],
        targetPlacement: 'UNKNOWN',
        targetMaterialization: 'NOT_CREATED',
      };

      topology.updateOne(
        { id: current.id, lifecycle: 'ACTIVE' },
        {
          $set: {
            aliases: [spec.destination],
            category: '48 VDC feeder',
            'attributes.declaredPower': declaredPower,
            'attributes.ratedCurrentA': rating.ratedCurrentA,
            'attributes.ratedCurrentProvenance': rating.ratedCurrentProvenance,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
      );
    }
  }

  const gateway = topology.findOne({
    kind: 'EQUIPMENT',
    lifecycle: 'ACTIVE',
    deviceId: qdf2.id,
    serialNumber: QDF2_SOURCE,
  });
  assert(gateway, 'QDF-2 gateway Equipment with serial ' + QDF2_SOURCE + ' not found');

  const sourceBindingId = 'integration:seed01:mqtt:' + QDF2_SOURCE + ':source';
  const sourceExisting = bindings.findOne({
    lifecycle: 'ACTIVE',
    protocol: 'MQTT',
    sourceIdentity: QDF2_SOURCE,
    sourcePointId: { $exists: false },
    metric: 'SOURCE',
  });
  if (!sourceExisting) {
    bindings.insertOne({
      id: sourceBindingId,
      protocol: 'MQTT',
      sourceIdentity: QDF2_SOURCE,
      metric: 'SOURCE',
      targetType: 'EQUIPMENT',
      targetId: gateway.id,
      lifecycle: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      revision: 1,
      attributes: {
        commissioning: 'CONTROLLED_INTEGRATION',
        integrationProfile: 'seed-01-controlled',
        transportEquipmentId: gateway.id,
      },
    });
    insertedBindings += 1;
  }

  for (const item of schedule) {
    for (const side of ['A', 'B']) {
      const spec = side === 'A' ? item.a : item.b;
      const panelName = side === 'A' ? 'A3' : 'B3';
      const group = PANEL_GROUP[panelName];
      const rawPointId = '0_' + group + '_' + spec.pos;
      const targetId = idsBySideRow.get(side + ':' + item.row);

      for (const m of METRICS) {
        const id =
          'integration:seed01:mqtt:' +
          QDF2_SOURCE +
          ':' +
          rawPointId +
          ':' +
          m.metric.toLowerCase();
        const conflict = bindings.findOne({
          lifecycle: 'ACTIVE',
          protocol: 'MQTT',
          sourceIdentity: QDF2_SOURCE,
          sourcePointId: rawPointId,
          metric: m.metric,
        });
        if (conflict) {
          assert(
            conflict.targetType === 'EQUIPMENT' && conflict.targetId === targetId,
            'MQTT source point already targets another Equipment: ' + rawPointId + ' ' + m.metric,
          );
          continue;
        }
        bindings.insertOne({
          id,
          protocol: 'MQTT',
          sourceIdentity: QDF2_SOURCE,
          sourcePointId: rawPointId,
          metric: m.metric,
          unit: m.unit,
          targetType: 'EQUIPMENT',
          targetId,
          lifecycle: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          revision: 1,
          attributes: {
            commissioning: 'CONTROLLED_INTEGRATION',
            integrationProfile: 'seed-01-controlled',
            synthetic: true,
            qdf: 'QDF-2',
            panelLabel: panelName,
            position: spec.pos,
          },
        });
        insertedBindings += 1;
      }
    }
  }

  const declaredBreakers = topology
    .find({
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      equipmentType: 'CIRCUIT_BREAKER',
      'attributes.declaredPower.qdf': { $in: ['QDF-2', 'QDF-4', 'QDF-5'] },
    })
    .toArray();

  assert(declaredBreakers.length === 74, 'expected exactly 74 declared breakers; found ' + declaredBreakers.length);

  for (const breaker of declaredBreakers) {
    const rating = standardRating(breaker);
    if (
      breaker.attributes?.ratedCurrentA !== rating.ratedCurrentA ||
      JSON.stringify(breaker.attributes?.ratedCurrentProvenance) !==
        JSON.stringify(rating.ratedCurrentProvenance)
    ) {
      topology.updateOne(
        { id: breaker.id, lifecycle: 'ACTIVE' },
        {
          $set: {
            'attributes.ratedCurrentA': rating.ratedCurrentA,
            'attributes.ratedCurrentProvenance': rating.ratedCurrentProvenance,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
      );
      updatedRatings += 1;
    }

    const currentBinding = bindings.findOne({
      lifecycle: 'ACTIVE',
      protocol: 'MQTT',
      targetType: 'EQUIPMENT',
      targetId: breaker.id,
      metric: 'CURRENT',
    });
    assert(currentBinding, 'CURRENT binding missing for breaker ' + breaker.name);

    const policyId =
      'seed01:alarm:' +
      currentBinding.sourceIdentity +
      ':' +
      currentBinding.sourcePointId +
      ':overcurrent';
    const sourceContext =
      'mqtt:' + currentBinding.sourceIdentity + ':' + currentBinding.sourcePointId;
    const desiredPolicy = {
      id: policyId,
      targetType: 'EQUIPMENT',
      targetId: breaker.id,
      sourceContext,
      sourceIdentity: currentBinding.sourceIdentity,
      enabled: true,
      overcurrent: {
        assertAboveA: rating.ratedCurrentA,
        clearBelowA: Number((rating.ratedCurrentA * 0.9).toFixed(3)),
        debounceSamples: 2,
        recoverySamples: 3,
        severity: 'CRITICAL',
      },
      attributes: {
        policySource: 'BREAKER_RATED_CURRENT',
        provisional: rating.ratedCurrentProvenance?.verified !== true,
        qdf: breaker.attributes.declaredPower.qdf,
        panelLabel: breaker.attributes.declaredPower.currentBreaker.panel,
        position: breaker.attributes.declaredPower.currentBreaker.position,
      },
      createdAt: now,
      updatedAt: now,
    };

    const existingPolicy = policies.findOne({ id: policyId });
    if (existingPolicy) {
      assert(
        existingPolicy.targetId === breaker.id &&
          existingPolicy.sourceIdentity === currentBinding.sourceIdentity &&
          existingPolicy.sourceContext === sourceContext,
        'existing overcurrent policy conflicts for ' + breaker.name,
      );
      policies.updateOne(
        { id: policyId },
        {
          $set: {
            enabled: true,
            overcurrent: desiredPolicy.overcurrent,
            attributes: desiredPolicy.attributes,
            updatedAt: now,
          },
        },
      );
    } else {
      policies.insertOne(desiredPolicy);
    }
    upsertedPolicies += 1;
  }

  const counts = {};
  for (const key of ['QDF-2', 'QDF-4', 'QDF-5']) {
    counts[key] = topology.countDocuments({
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      equipmentType: 'CIRCUIT_BREAKER',
      'attributes.declaredPower.qdf': key,
    });
  }
  assert(counts['QDF-2'] === 26, 'QDF-2 must contain 26 declared breakers');
  assert(counts['QDF-4'] === 12, 'QDF-4 must contain 12 declared breakers');
  assert(counts['QDF-5'] === 36, 'QDF-5 must contain 36 declared breakers');

  const nextBdfbs = state.bdfbs.map((item) => ({
    ...item,
    breakerCount: counts[item.key],
  }));
  tx.runtime_seed_state.updateOne(
    { _id: 'seed-01', status: 'APPLIED' },
    {
      $set: {
        version: 8,
        bdfbs: nextBdfbs,
        updatedAt: now,
        qdf2BreakerMigration: 'POST_MIGRATION_POSITIONS_DECLARED',
        breakerRatedCurrentStandardA: STANDARD_RATED_CURRENT_A,
        breakerRatedCurrentStandardState: 'PROVISIONAL',
      },
    },
  );

  session.commitTransaction();

  printjson({
    status: 'SEED01_V8_APPLIED',
    qdf2BreakersCreated: createdBreakers,
    qdf2BindingsInserted: insertedBindings,
    ratingsUpdated: updatedRatings,
    overcurrentPoliciesUpserted: upsertedPolicies,
    ratedCurrentStandardA: STANDARD_RATED_CURRENT_A,
    ratedCurrentVerified: false,
    breakerCounts: counts,
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
