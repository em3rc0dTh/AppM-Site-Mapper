const DATABASE = 'seed-01';
const MODE = process.env.SITEMAPPER_SEED01_LAB_MODE || 'plan';
const ACK = process.env.SITEMAPPER_SEED01_LAB_ACK || '';
const MARK = 'SEED_01_SYNTHETIC_LAB_V1';
const PANEL_GROUP = { A3: 1, A2: 2, B3: 3, B2: 4 };
const SOURCES = {
  'QDF-2': 'EMU-TELXIUS-QDF-2',
  'QDF-4': 'EMU-TELXIUS-QDF-4',
  'QDF-5': 'EMU-TELXIUS-QDF-5',
};
const METRICS = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'];

function assert(value, message) {
  if (!value) throw new Error('SEED01 LAB BLOCKED: ' + message);
}
assert(['plan', 'apply', 'retire'].includes(MODE), 'mode must be plan/apply/retire');

const d = db.getSiblingDB(DATABASE);
const state = d.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
assert(state && state.version >= 4, 'seed-01 v4+ must be APPLIED');
assert(Array.isArray(state.bdfbs) && state.bdfbs.length === 3, 'expected exactly 3 seeded BDFBs');

if (MODE === 'retire') {
  assert(ACK === 'LAB_ONLY', 'LAB_ONLY acknowledgement required to retire synthetic bindings');
  const now = new Date().toISOString();
  const result = d.telemetry_bindings.updateMany(
    { lifecycle: 'ACTIVE', 'attributes.commissioning': MARK },
    { $set: { lifecycle: 'ARCHIVED', updatedAt: now } },
  );
  print('SEED01 LAB RETIRED bindings=' + result.modifiedCount);
  quit(0);
}

const desired = [];
for (const item of state.bdfbs) {
  const source = SOURCES[item.key];
  assert(source, 'unexpected BDFB key ' + item.key);
  const device = d.topology_nodes.findOne({
    id: item.deviceId,
    kind: 'DEVICE',
    deviceType: 'BDFB',
    lifecycle: 'ACTIVE',
  });
  assert(device, 'missing active BDFB Device ' + item.key);

  desired.push({
    id: 'lab:seed01:mqtt:' + source + ':source',
    protocol: 'MQTT',
    sourceIdentity: source,
    metric: 'SOURCE',
    targetType: 'DEVICE',
    targetId: device.id,
    lifecycle: 'ACTIVE',
    attributes: {
      commissioning: MARK,
      synthetic: true,
      labProfile: 'TELXIUS_SEED_01',
      qdf: item.key,
    },
  });

  const equipment = d.topology_nodes
    .find({ kind: 'EQUIPMENT', deviceId: device.id, lifecycle: 'ACTIVE' })
    .toArray();
  const byId = new Map(equipment.map((x) => [x.id, x]));
  for (const panelName of Object.keys(PANEL_GROUP)) {
    const panels = equipment.filter(
      (x) => x.equipmentType === 'PANEL' && x.name === panelName,
    );
    assert(panels.length === 1, item.key + ' must have exactly one PANEL ' + panelName);
    const panel = panels[0];
    assert(
      panel.childMode === 'POSITIONAL' &&
        Array.isArray(panel.children) &&
        panel.children.length === 24,
      item.key + ' PANEL ' + panelName + ' must expose 24 positions',
    );
    for (let index = 0; index < panel.children.length; index += 1) {
      const breakerId = panel.children[index];
      if (!breakerId) continue;
      const breaker = byId.get(breakerId);
      assert(
        breaker &&
          breaker.equipmentType === 'CIRCUIT_BREAKER' &&
          breaker.parentEquipmentId === panel.id,
        item.key + ' invalid breaker at ' + panelName + '-' + (index + 1),
      );
      const rawPointId = '0_' + PANEL_GROUP[panelName] + '_' + (index + 1);
      for (const metric of METRICS) {
        desired.push({
          id:
            'lab:seed01:mqtt:' +
            source +
            ':' +
            rawPointId +
            ':' +
            metric.toLowerCase(),
          protocol: 'MQTT',
          sourceIdentity: source,
          sourcePointId: rawPointId,
          metric,
          targetType: 'EQUIPMENT',
          targetId: breaker.id,
          lifecycle: 'ACTIVE',
          attributes: {
            commissioning: MARK,
            synthetic: true,
            labProfile: 'TELXIUS_SEED_01',
            qdf: item.key,
            panelLabel: panelName,
            position: index + 1,
          },
        });
      }
    }
  }
}

const sourceCount = desired.filter((x) => x.metric === 'SOURCE').length;
const pointCount = desired.length - sourceCount;
assert(sourceCount === 3, 'expected 3 source bindings');
assert(pointCount === 48 * 4, 'expected 192 metric bindings for 48 confirmed breakers');

for (const want of desired) {
  const sourceMatch = d.telemetry_bindings.find({
    lifecycle: 'ACTIVE',
    protocol: want.protocol,
    sourceIdentity: want.sourceIdentity,
    sourcePointId:
      want.sourcePointId === undefined ? { $exists: false } : want.sourcePointId,
    metric: want.metric,
  }).toArray();
  assert(sourceMatch.length <= 1, 'duplicate source binding for ' + want.id);
  if (sourceMatch.length === 1) {
    const have = sourceMatch[0];
    assert(
      have.targetType === want.targetType &&
        have.targetId === want.targetId &&
        have.attributes?.commissioning === MARK,
      'source identity already commissioned differently: ' + want.id,
    );
  }
  if (want.metric !== 'SOURCE') {
    const targetConflicts = d.telemetry_bindings.find({
      lifecycle: 'ACTIVE',
      targetType: 'EQUIPMENT',
      targetId: want.targetId,
      metric: want.metric,
      $or: [
        { sourceIdentity: { $ne: want.sourceIdentity } },
        { sourcePointId: { $ne: want.sourcePointId } },
      ],
    }).toArray();
    assert(targetConflicts.length === 0, 'breaker already owns another telemetry source');
  }
}

const existingIds = new Set(
  d.telemetry_bindings
    .find({ id: { $in: desired.map((x) => x.id) } }, { id: 1 })
    .toArray()
    .map((x) => x.id),
);
const inserts = desired.filter((x) => !existingIds.has(x.id));
print(
  'SEED01 TELXIUS MQTT LAB mode=' +
    MODE +
    ' desired=' +
    desired.length +
    ' sourceBindings=' +
    sourceCount +
    ' metricBindings=' +
    pointCount +
    ' new=' +
    inserts.length,
);
for (const item of state.bdfbs) {
  const source = SOURCES[item.key];
  const mapped = desired.filter((x) => x.sourceIdentity === source && x.metric !== 'SOURCE').length / 4;
  print(item.key + ' source=' + source + ' mappedBreakers=' + mapped);
}

if (MODE === 'plan') {
  print('PLAN ONLY, 0 writes. Use SITEMAPPER_SEED01_LAB_MODE=apply and LAB_ONLY acknowledgement.');
  quit(0);
}
assert(ACK === 'LAB_ONLY', 'LAB_ONLY acknowledgement required to apply synthetic bindings');
if (!inserts.length) {
  print('ALREADY COMMISSIONED, 0 writes.');
  quit(0);
}

const now = new Date().toISOString();
const session = d.getMongo().startSession();
try {
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  const tx = session.getDatabase(DATABASE);
  tx.telemetry_bindings.insertMany(
    inserts.map((x) => ({ ...x, createdAt: now, updatedAt: now, revision: 1 })),
    { ordered: true },
  );
  session.commitTransaction();
  print('SEED01 TELXIUS MQTT LAB COMMITTED newBindings=' + inserts.length);
} catch (error) {
  try {
    session.abortTransaction();
  } catch (_) {}
  throw error;
} finally {
  session.endSession();
}
