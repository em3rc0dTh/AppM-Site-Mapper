const d = db.getSiblingDB('seed-01');

function assert(value, message) {
  if (!value) throw new Error('S00_LOCAL_BLOCKED: ' + message);
}

const expected = [
  { key: 'QDF-2', name: 'BDFB QDF-2', serial: '26092403950003', breakers: 26 },
  { key: 'QDF-4', name: 'BDFB QDF-4', serial: '26092403950004', breakers: 12 },
  { key: 'QDF-5', name: 'BDFB QDF-5', serial: '26092403950002', breakers: 36 },
];

const state = d.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
assert(state, 'seed-01 state missing');
assert(state.version === 8, 'expected seed-01 v8, found ' + state.version);

let totalBreakers = 0;
const qdfs = [];

for (const spec of expected) {
  const devices = d.topology_nodes.find({
    kind: 'DEVICE',
    lifecycle: 'ACTIVE',
    deviceType: 'BDFB',
    name: spec.name,
  }).toArray();
  assert(devices.length === 1, spec.key + ' active Device expected exactly once');
  const device = devices[0];

  const breakers = d.topology_nodes.find({
    kind: 'EQUIPMENT',
    lifecycle: 'ACTIVE',
    deviceId: device.id,
    equipmentType: 'CIRCUIT_BREAKER',
  }).toArray();
  assert(breakers.length === spec.breakers, spec.key + ' expected ' + spec.breakers + ' breakers, found ' + breakers.length);
  totalBreakers += breakers.length;

  for (const panelName of ['A3', 'B3']) {
    const panels = d.topology_nodes.find({
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      deviceId: device.id,
      equipmentType: 'PANEL',
      name: panelName,
    }).toArray();
    assert(panels.length === 1, spec.key + ' expected one ' + panelName);
    const occupied = panels[0].children.filter(Boolean).length;
    assert(occupied === spec.breakers / 2, spec.key + ' ' + panelName + ' occupied=' + occupied);
  }

  const gateway = d.topology_nodes.find({
    kind: 'EQUIPMENT',
    lifecycle: 'ACTIVE',
    deviceId: device.id,
    serialNumber: spec.serial,
  }).toArray();
  assert(gateway.length === 1, spec.key + ' gateway serial mismatch');

  const sourceBindings = d.telemetry_bindings.find({
    lifecycle: 'ACTIVE',
    protocol: 'MQTT',
    sourceIdentity: spec.serial,
    metric: 'SOURCE',
  }).toArray();
  assert(sourceBindings.length === 1, spec.key + ' expected one MQTT SOURCE binding');

  const metricBindings = d.telemetry_bindings.countDocuments({
    lifecycle: 'ACTIVE',
    protocol: 'MQTT',
    sourceIdentity: spec.serial,
    sourcePointId: { $exists: true },
  });
  assert(metricBindings === spec.breakers * 4, spec.key + ' expected ' + (spec.breakers * 4) + ' MQTT metric bindings, found ' + metricBindings);

  const snmpSource = 'INT-SNMP-' + spec.key;
  const snmpBindings = d.telemetry_bindings.find({
    lifecycle: 'ACTIVE',
    protocol: 'SNMP',
    sourceIdentity: snmpSource,
  }).toArray();
  assert(snmpBindings.length === 8, snmpSource + ' expected 8 controlled Config4 bindings');

  qdfs.push({
    key: spec.key,
    deviceId: device.id,
    breakers: breakers.length,
    mqttMetricBindings: metricBindings,
    snmpBindings: snmpBindings.length,
  });
}

assert(totalBreakers === 74, 'expected 74 breakers, found ' + totalBreakers);

const duplicateSourceBindings = d.telemetry_bindings.aggregate([
  { $match: { lifecycle: 'ACTIVE' } },
  { $group: {
      _id: {
        protocol: '$protocol',
        sourceIdentity: '$sourceIdentity',
        sourcePointId: { $ifNull: ['$sourcePointId', null] },
        metric: '$metric',
      },
      count: { $sum: 1 },
    }
  },
  { $match: { count: { $gt: 1 } } },
]).toArray();
assert(duplicateSourceBindings.length === 0, 'duplicate active source bindings: ' + JSON.stringify(duplicateSourceBindings));

printjson({
  status: 'S00_LOCAL_MONGO_PASS',
  seedVersion: state.version,
  totalBreakers,
  qdfs,
  activeBindings: d.telemetry_bindings.countDocuments({ lifecycle: 'ACTIVE' }),
});
