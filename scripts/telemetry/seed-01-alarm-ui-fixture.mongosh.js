// Seed-01 alarm UI design fixture.
// LAB ONLY. Never run against field/customer data.
//
// Apply with Docker only:
// docker exec -i -e SITEMAPPER_ALARM_DEMO_ACK=LAB_ONLY \
//   site-mapper-seed-01-mongodb-1 mongosh --quiet seed-01 \
//   < scripts/telemetry/seed-01-alarm-ui-fixture.mongosh.js
//
// Clear with:
// docker exec -i -e SITEMAPPER_ALARM_DEMO_ACK=LAB_ONLY \
//   -e SITEMAPPER_ALARM_DEMO_MODE=clear \
//   site-mapper-seed-01-mongodb-1 mongosh --quiet seed-01 \
//   < scripts/telemetry/seed-01-alarm-ui-fixture.mongosh.js

const acknowledgement = process.env.SITEMAPPER_ALARM_DEMO_ACK;
const mode = process.env.SITEMAPPER_ALARM_DEMO_MODE || 'apply';

if (acknowledgement !== 'LAB_ONLY') {
  throw new Error('ALARM_UI_FIXTURE_BLOCKED: set SITEMAPPER_ALARM_DEMO_ACK=LAB_ONLY');
}
if (db.getName() !== 'seed-01') {
  throw new Error('ALARM_UI_FIXTURE_BLOCKED: this fixture only targets database seed-01');
}
if (!['apply', 'clear'].includes(mode)) {
  throw new Error('ALARM_UI_FIXTURE_BLOCKED: mode must be apply or clear');
}

const marker = 'LAB_UI_DESIGN_FIXTURE_2026_10_30';
const occurrences = db.getCollection('alarm_occurrences');
const transitions = db.getCollection('alarm_transitions');

if (mode === 'clear') {
  const ids = occurrences
    .find({ fixtureMarker: marker }, { id: 1 })
    .toArray()
    .map((item) => item.id);
  if (ids.length) transitions.deleteMany({ alarmOccurrenceId: { $in: ids } });
  const result = occurrences.deleteMany({ fixtureMarker: marker });
  print(JSON.stringify({ mode, marker, removed: result.deletedCount, transitionIds: ids.length }));
  quit(0);
}

const bdfb = db.topology_nodes.findOne({
  kind: 'DEVICE',
  lifecycle: 'ACTIVE',
  deviceType: 'BDFB',
  name: 'BDFB QDF-4',
});
if (!bdfb) throw new Error('ALARM_UI_FIXTURE_BLOCKED: BDFB QDF-4 not found');

const panel = db.topology_nodes.findOne({
  kind: 'EQUIPMENT',
  lifecycle: 'ACTIVE',
  deviceId: bdfb.id,
  equipmentType: 'PANEL',
  name: 'A3',
});
if (!panel) throw new Error('ALARM_UI_FIXTURE_BLOCKED: QDF-4 panel A3 not found');

function breaker(name) {
  const item = db.topology_nodes.findOne({
    kind: 'EQUIPMENT',
    lifecycle: 'ACTIVE',
    deviceId: bdfb.id,
    equipmentType: 'CIRCUIT_BREAKER',
    parentEquipmentId: panel.id,
    name,
  });
  if (!item) throw new Error('ALARM_UI_FIXTURE_BLOCKED: breaker ' + name + ' not found');
  return item;
}

const p03 = breaker('A3-03');
const p04 = breaker('A3-04');
const now = new Date();
const openedPower = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
const openedTelemetry = new Date(now.getTime() - 8 * 60 * 1000).toISOString();
const nowIso = now.toISOString();

const fixtures = [
  {
    id: 'lab-ui-power-loss-a3-04',
    alarmCode: 'POWER_LOSS',
    family: 'CORRELATED',
    name: 'Power loss',
    targetType: 'EQUIPMENT',
    targetId: p04.id,
    sourceContext: marker + ':POWER_LOSS',
    openedAt: openedPower,
    lastObservedAt: nowIso,
    lifecycle: 'ACTIVE',
    severity: 'CRITICAL',
    confidence: 'CONFIRMED',
    acknowledgement: 'UNACKNOWLEDGED',
    correlationKey: [p04.id, 'POWER_LOSS', marker + ':POWER_LOSS'].join('|'),
    ruleVersion: 'v1-lab-ui',
    evidenceRefs: [
      {
        id: 'lab-ui-power-voltage',
        kind: 'MQTT',
        sourceIdentity: 'EMU-TELXIUS-QDF-4',
        sourcePointId: '0_1_4',
        metric: 'VOLTAGE',
        value: 0.4,
        unit: 'V',
        observedAt: nowIso,
        note: 'Synthetic UI fixture. Not field evidence.',
      },
      {
        id: 'lab-ui-power-current',
        kind: 'MQTT',
        sourceIdentity: 'EMU-TELXIUS-QDF-4',
        sourcePointId: '0_1_4',
        metric: 'CURRENT',
        value: 0,
        unit: 'A',
        observedAt: nowIso,
        note: 'Synthetic UI fixture. Not field evidence.',
      },
      {
        id: 'lab-ui-power-snmp',
        kind: 'SNMP',
        sourceIdentity: 'EMU-SMARTPACK2-LURIN',
        metric: 'FUSE_ALARM',
        value: 'ACTIVE',
        observedAt: nowIso,
        note: 'Synthetic corroboration for UI validation only.',
      },
    ],
    fixtureMarker: marker,
    createdAt: openedPower,
    updatedAt: nowIso,
  },
  {
    id: 'lab-ui-telemetry-loss-a3-03',
    alarmCode: 'TELEMETRY_LOSS',
    family: 'COMMUNICATION',
    name: 'Telemetry loss',
    targetType: 'EQUIPMENT',
    targetId: p03.id,
    sourceContext: marker + ':TELEMETRY_LOSS',
    openedAt: openedTelemetry,
    lastObservedAt: openedTelemetry,
    lifecycle: 'ACTIVE',
    severity: 'WARNING',
    acknowledgement: 'UNACKNOWLEDGED',
    correlationKey: [p03.id, 'TELEMETRY_LOSS', marker + ':TELEMETRY_LOSS'].join('|'),
    ruleVersion: 'v1-lab-ui',
    evidenceRefs: [
      {
        id: 'lab-ui-watchdog-p03',
        kind: 'WATCHDOG',
        sourceIdentity: 'EMU-TELXIUS-QDF-4',
        sourcePointId: '0_1_3',
        metric: 'telemetry_age_ms',
        value: 480000,
        unit: 'ms',
        observedAt: nowIso,
        note: 'Synthetic UI fixture. Not field evidence.',
      },
    ],
    fixtureMarker: marker,
    createdAt: openedTelemetry,
    updatedAt: nowIso,
  },
];

for (const fixture of fixtures) {
  occurrences.replaceOne({ id: fixture.id }, fixture, { upsert: true });
  transitions.deleteMany({ alarmOccurrenceId: fixture.id, metadata: { fixtureMarker: marker } });
  transitions.insertOne({
    id: fixture.id + '-opened',
    alarmOccurrenceId: fixture.id,
    fromState: 'CLEAR',
    toState: 'ACTIVE',
    occurredAt: fixture.openedAt,
    reason: 'LAB_UI_DESIGN_FIXTURE',
    evidenceRefs: fixture.evidenceRefs.map((item) => item.id),
    metadata: { fixtureMarker: marker },
  });
}

print(
  JSON.stringify({
    mode,
    marker,
    bdfb: bdfb.name,
    panel: panel.name,
    targets: fixtures.map((item) => ({
      id: item.id,
      targetId: item.targetId,
      alarmCode: item.alarmCode,
    })),
    warning: 'Synthetic UI-only alarms. Do not treat as field evidence.',
  }),
);
