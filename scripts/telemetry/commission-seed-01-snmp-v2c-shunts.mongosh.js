const DATABASE = 'seed-01';
const MODE = process.env.SITEMAPPER_SEED01_V2C_MODE || 'plan';
const ACK = process.env.SITEMAPPER_SEED01_V2C_ACK || '';
const MARK = 'SEED_01_SNMP_V2C_SHUNTS_V1';
const BDFB_IDS = { 'QDF-2': 'BFDB-01', 'QDF-4': 'BFDB-02', 'QDF-5': 'BFDB-03' };
const SOURCES = {
  'QDF-2': 'EMU-SNMPV2C-QDF-2',
  'QDF-4': 'EMU-SNMPV2C-QDF-4',
  'QDF-5': 'EMU-SNMPV2C-QDF-5',
};
const FEEDS = [
  { slot: 'A1', side: 'A', panel: 'A3', index: 1 },
  { slot: 'A2', side: 'A', panel: 'A2', index: 2 },
  { slot: 'B1', side: 'B', panel: 'B3', index: 3 },
  { slot: 'B2', side: 'B', panel: 'B2', index: 4 },
];

function assert(value, message) {
  if (!value) throw new Error('SEED01 SNMPV2C LAB BLOCKED: ' + message);
}
assert(['plan', 'apply', 'retire'].includes(MODE), 'mode must be plan/apply/retire');
if (MODE !== 'plan') assert(ACK === 'LAB_ONLY', 'LAB_ONLY acknowledgement required');

const d = db.getSiblingDB(DATABASE);
const state = d.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
assert(state && state.version >= 4, 'seed-01 v4+ required');

if (MODE === 'retire') {
  const bindingResult = d.telemetry_bindings.deleteMany({ 'attributes.labMark': MARK });
  let removedPorts = 0;
  for (const row of state.bdfbs) {
    const chassis = d.topology_nodes
      .find({
        kind: 'EQUIPMENT',
        deviceId: row.deviceId,
        equipmentType: 'CHASSIS',
        lifecycle: 'ACTIVE',
      })
      .toArray();
    assert(chassis.length === 1, row.key + ' must have exactly one active CHASSIS');
    const ports = Array.isArray(chassis[0].accessPorts) ? chassis[0].accessPorts : [];
    const kept = ports.filter((p) => p?.attributes?.labMark !== MARK);
    removedPorts += ports.length - kept.length;
    if (kept.length !== ports.length)
      d.topology_nodes.updateOne({ _id: chassis[0]._id }, { $set: { accessPorts: kept } });
  }
  print(JSON.stringify({ mode: MODE, removedBindings: bindingResult.deletedCount, removedPorts }));
  quit(0);
}

const plans = [];
for (const row of state.bdfbs) {
  const sourceIdentity = SOURCES[row.key];
  assert(sourceIdentity, 'unexpected BDFB key ' + row.key);
  const device = d.topology_nodes.findOne({
    id: row.deviceId,
    kind: 'DEVICE',
    deviceType: 'BDFB',
    lifecycle: 'ACTIVE',
  });
  assert(device, 'missing active BDFB Device ' + row.key);
  const chassisRows = d.topology_nodes
    .find({
      kind: 'EQUIPMENT',
      deviceId: device.id,
      equipmentType: 'CHASSIS',
      lifecycle: 'ACTIVE',
    })
    .toArray();
  assert(chassisRows.length === 1, row.key + ' must have exactly one active CHASSIS');
  const chassis = chassisRows[0];
  const equipment = d.topology_nodes
    .find({
      kind: 'EQUIPMENT',
      deviceId: device.id,
      lifecycle: 'ACTIVE',
    })
    .toArray();
  const panels = {};
  for (const feed of FEEDS) {
    const matched = equipment.filter(
      (x) => x.equipmentType === 'PANEL' && x.name === feed.panel,
    );
    assert(matched.length === 1, row.key + ' requires exactly one PANEL ' + feed.panel);
    panels[feed.panel] = matched[0];
  }

  const ports = FEEDS.map((feed) => ({
    id: 'lab:seed01:snmpv2c:' + row.key + ':feed:' + feed.slot,
    deviceId: device.id,
    equipmentId: chassis.id,
    name: 'LAB SHUNT ' + feed.slot,
    portType: 'POWER',
    direction: 'INPUT',
    exposure: 'EXTERNAL',
    protocol: 'SNMPv2c',
    attributes: {
      snmpFeedInput: true,
      feed: feed.side,
      feedPosition: feed.slot,
      ratedCurrentA: 800,
      shuntRatedCurrentA: 1000,
      shuntRatedMillivolts: 60,
      overloadThresholdA: 640,
      servedPanelIds: [panels[feed.panel].id],
      independentInputConfirmed: false,
      commissioning: 'SYNTHETIC_LAB_ONLY',
      labMark: MARK,
      synthetic: true,
      syntheticPanelMapping: feed.panel,
      hardwareProfile: 'ELTEK_BDCBB_CONFIG_4',
    },
    lifecycle: 'ACTIVE',
  }));

  const bindings = ports.flatMap((port, feedIndex) => {
    const index = FEEDS[feedIndex].index;
    return [
      {
        metric: 'CURRENT',
        oid: '1.3.6.1.4.1.8072.9999.2026.49.1.' + index + '.0',
        unit: 'A',
      },
      {
        metric: 'VOLTAGE',
        oid: '1.3.6.1.4.1.8072.9999.2026.49.2.' + index + '.0',
        unit: 'V',
      },
    ].map((point) => ({
      id:
        'lab:seed01:snmpv2c:' +
        row.key +
        ':' +
        FEEDS[feedIndex].slot +
        ':' +
        point.metric.toLowerCase(),
      protocol: 'SNMP',
      sourceIdentity,
      sourcePointId: point.oid,
      metric: point.metric,
      unit: point.unit,
      targetType: 'ACCESS_PORT',
      targetId: port.id,
      lifecycle: 'ACTIVE',
      attributes: {
        commissioning: 'SYNTHETIC_LAB_ONLY',
        labMark: MARK,
        synthetic: true,
        qdf: row.key,
        bfdbEmulatorId: BDFB_IDS[row.key],
        feedPosition: FEEDS[feedIndex].slot,
      },
    }));
  });

  const foreignPortIds = new Set(
    (Array.isArray(chassis.accessPorts) ? chassis.accessPorts : [])
      .filter((p) => p?.attributes?.labMark !== MARK)
      .map((p) => p.id),
  );
  for (const port of ports)
    assert(
      !foreignPortIds.has(port.id),
      row.key + ' lab port id conflicts with existing inventory',
    );

  for (const binding of bindings) {
    const sourceConflicts = d.telemetry_bindings
      .find({
        protocol: 'SNMP',
        sourceIdentity: binding.sourceIdentity,
        sourcePointId: binding.sourcePointId,
        metric: binding.metric,
        lifecycle: 'ACTIVE',
        id: { $ne: binding.id },
      })
      .toArray();
    assert(
      sourceConflicts.length === 0,
      row.key + ' source OID already commissioned: ' + binding.sourcePointId,
    );
    const targetConflicts = d.telemetry_bindings
      .find({
        protocol: 'SNMP',
        targetType: 'ACCESS_PORT',
        targetId: binding.targetId,
        metric: binding.metric,
        lifecycle: 'ACTIVE',
        id: { $ne: binding.id },
      })
      .toArray();
    assert(
      targetConflicts.length === 0,
      row.key + ' target port already has ' + binding.metric,
    );
  }
  plans.push({ row, chassis, ports, bindings });
}

print(
  JSON.stringify({
    mode: MODE,
    qdfs: plans.map((p) => ({
      qdf: p.row.key,
      source: SOURCES[p.row.key],
      shunts: p.ports.map((x) => x.attributes.feedPosition),
      bindings: p.bindings.length,
    })),
    syntheticOnly: true,
  }),
);

if (MODE === 'plan') quit(0);

for (const plan of plans) {
  const existing = Array.isArray(plan.chassis.accessPorts) ? plan.chassis.accessPorts : [];
  const preserved = existing.filter((p) => p?.attributes?.labMark !== MARK);
  d.topology_nodes.updateOne(
    { _id: plan.chassis._id },
    { $set: { accessPorts: [...preserved, ...plan.ports] } },
  );
  const now = new Date().toISOString();
  for (const binding of plan.bindings) {
    d.telemetry_bindings.replaceOne(
      { id: binding.id },
      { ...binding, createdAt: now, updatedAt: now },
      { upsert: true },
    );
  }
}

print(
  JSON.stringify({
    mode: MODE,
    applied: true,
    ports: plans.reduce((n, p) => n + p.ports.length, 0),
    bindings: plans.reduce((n, p) => n + p.bindings.length, 0),
    physicalVerification: false,
    mark: MARK,
  }),
);
