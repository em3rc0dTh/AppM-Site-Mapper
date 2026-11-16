const d = db.getSiblingDB('seed-01');

function assert(value, message) {
  if (!value) throw new Error('S00_BASELINE_BLOCKED: ' + message);
}

const expected = [
  { key: 'QDF-2', deviceName: 'BDFB QDF-2', serial: '26092403950003', perPanel: 13 },
  { key: 'QDF-4', deviceName: 'BDFB QDF-4', serial: '26092403950004', perPanel: 6 },
  { key: 'QDF-5', deviceName: 'BDFB QDF-5', serial: '26092403950002', perPanel: 18 },
];

const result = { qdfs: [], mqtt: {}, snmp: {}, totals: {} };
let totalBreakers = 0;

for (const spec of expected) {
  const devices = d.topology_nodes
    .find({ kind: 'DEVICE', lifecycle: 'ACTIVE', deviceType: 'BDFB', name: spec.deviceName })
    .toArray();
  assert(devices.length === 1, spec.key + ' expected exactly one active BDFB Device');
  const device = devices[0];

  const gateways = d.topology_nodes
    .find({
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      deviceId: device.id,
      serialNumber: spec.serial,
    })
    .toArray();
  assert(gateways.length === 1, spec.key + ' expected exactly one gateway serial ' + spec.serial);

  const panels = {};
  for (const panelName of ['A3', 'B3']) {
    const rows = d.topology_nodes
      .find({
        kind: 'EQUIPMENT',
        lifecycle: 'ACTIVE',
        deviceId: device.id,
        equipmentType: 'PANEL',
        name: panelName,
      })
      .toArray();
    assert(rows.length === 1, spec.key + ' expected exactly one ' + panelName);
    const panel = rows[0];
    assert(
      Array.isArray(panel.children) && panel.children.length === 24,
      spec.key + ' ' + panelName + ' must expose 24 positions',
    );
    const occupied = [];
    for (let i = 0; i < panel.children.length; i += 1) {
      if (!panel.children[i]) continue;
      const breaker = d.topology_nodes.findOne({ id: panel.children[i] });
      assert(
        breaker &&
          breaker.kind === 'EQUIPMENT' &&
          breaker.lifecycle === 'ACTIVE' &&
          breaker.equipmentType === 'CIRCUIT_BREAKER' &&
          breaker.deviceId === device.id &&
          breaker.parentEquipmentId === panel.id,
        spec.key + ' ' + panelName + '-' + (i + 1) + ' invalid breaker identity',
      );
      occupied.push(i + 1);
    }
    const expectedPositions = Array.from({ length: spec.perPanel }, (_, i) => i + 1);
    assert(
      JSON.stringify(occupied) === JSON.stringify(expectedPositions),
      spec.key +
        ' ' +
        panelName +
        ' expected positions ' +
        expectedPositions.join(',') +
        ', got ' +
        occupied.join(','),
    );
    panels[panelName] = occupied.length;
  }

  const breakerCount = d.topology_nodes.countDocuments({
    kind: 'EQUIPMENT',
    lifecycle: 'ACTIVE',
    deviceId: device.id,
    equipmentType: 'CIRCUIT_BREAKER',
  });
  assert(breakerCount === spec.perPanel * 2, spec.key + ' breaker count mismatch: ' + breakerCount);
  totalBreakers += breakerCount;

  const mqtt = d.telemetry_bindings
    .find({ lifecycle: 'ACTIVE', protocol: 'MQTT', sourceIdentity: spec.serial })
    .toArray();
  const sourceBindings = mqtt.filter(
    (x) => !x.sourcePointId && String(x.metric).toUpperCase() === 'SOURCE',
  );
  assert(sourceBindings.length <= 1, spec.key + ' has ambiguous MQTT SOURCE bindings');

  result.qdfs.push({
    key: spec.key,
    deviceId: device.id,
    gatewayEquipmentId: gateways[0].id,
    serial: spec.serial,
    breakers: breakerCount,
    panels,
  });
  result.mqtt[spec.key] = {
    sourceBindings: sourceBindings.length,
    metricBindings: mqtt.filter((x) => x.sourcePointId).length,
    autoReconciled: mqtt.filter((x) => x.attributes?.commissioning === 'AUTO_RECONCILED').length,
  };
}

assert(totalBreakers === 74, 'expected 74 active breakers, found ' + totalBreakers);

const duplicateBindings = d.telemetry_bindings
  .aggregate([
    { $match: { lifecycle: 'ACTIVE' } },
    {
      $group: {
        _id: {
          protocol: '$protocol',
          sourceIdentity: '$sourceIdentity',
          sourcePointId: { $ifNull: ['$sourcePointId', null] },
          metric: '$metric',
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ])
  .toArray();
assert(
  duplicateBindings.length === 0,
  'duplicate active telemetry source-point bindings: ' + JSON.stringify(duplicateBindings),
);

const snmpSources = ['EMU-DELTA-BFDB-01', 'EMU-DELTA-BFDB-02', 'EMU-DELTA-BFDB-03'];
for (const source of snmpSources) {
  const rows = d.telemetry_bindings
    .find({ lifecycle: 'ACTIVE', protocol: 'SNMP', sourceIdentity: source })
    .toArray();
  const metrics = rows.map((x) => String(x.metric).toUpperCase()).sort();
  assert(rows.length === 4, source + ' expected 4 active Config2 bindings; found ' + rows.length);
  assert(
    metrics.filter((x) => x === 'CURRENT').length === 2,
    source + ' expected 2 CURRENT bindings',
  );
  assert(
    metrics.filter((x) => x === 'VOLTAGE').length === 2,
    source + ' expected 2 VOLTAGE bindings',
  );
  result.snmp[source] = { bindings: rows.length, metrics };
}

const activeSerialDuplicates = d.topology_nodes
  .aggregate([
    {
      $match: {
        lifecycle: 'ACTIVE',
        kind: { $in: ['DEVICE', 'EQUIPMENT'] },
        serialNumber: { $type: 'string', $ne: '' },
      },
    },
    { $group: { _id: '$serialNumber', ids: { $addToSet: '$id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ])
  .toArray();
assert(
  activeSerialDuplicates.length === 0,
  'duplicate active inventory serials: ' + JSON.stringify(activeSerialDuplicates),
);

const state = d.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
assert(state, 'runtime_seed_state seed-01 missing');
result.totals = {
  breakers: totalBreakers,
  activeBindings: d.telemetry_bindings.countDocuments({ lifecycle: 'ACTIVE' }),
  seedVersion: state.version,
};
printjson({ status: 'S00_MONGO_BASELINE_PASS', ...result });
