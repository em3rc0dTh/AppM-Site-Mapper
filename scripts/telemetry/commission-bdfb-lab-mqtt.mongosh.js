/*
 * Site Mapper: independently commission synthetic MQTT for BDFB-02/03.
 * Default is read-only PLAN. Run only AFTER topology-only provisioning.
 *
 * docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
 *   --file /dev/stdin < scripts/telemetry/commission-bdfb-lab-mqtt.mongosh.js
 *
 * Explicit atomic apply after backup and successful plan:
 * docker exec -i -e SITEMAPPER_MQTT_COMMISSION_MODE=apply \
 *   -e SITEMAPPER_MQTT_COMMISSION_ACK=LAB_ONLY \
 *   appm-site-mapper-mongodb-1 mongosh --quiet \
 *   --file /dev/stdin < scripts/telemetry/commission-bdfb-lab-mqtt.mongosh.js
 *
 * Never rewrite EMU-BFDB-01/02/03 original SOURCE mappings.
 * LAB-BDFB-02/03 are independent publishers; start them ONLY after
 * this binding transaction succeeds, and never confuse them with field gear.
 */
const DATABASE = 'site_mapper_crud_acceptance_02';
const ROOM = '2edcffc1-f1ef-454a-a044-c622480002cc';
const PRIMARY = {
  id: '157fcac1-cb34-44ad-b0e4-c127ad94999a',
  rack: '63b7c24c-6a36-4e28-92e6-db1268c43d15',
  serial: 'EMU-BFDB-10',
};
const TARGETS = [
  {
    name: 'BDFB-02',
    serial: 'LAB-BDFB-02',
    rack: '5b53762f-cc60-4118-8dbc-94ef841882a4',
    bay: '19dc1a19-cc45-4cd7-94a0-1223ff3794f9',
    older: 'EMU-BFDB-02',
    originalBinding: 'auto:mqtt:bb137f93188ec2f23b90b1c40f940d1cc4ce8adb6526e1934c2e9f4936e0dbe8',
    originalTarget: '540efb3c-d6a8-4633-b6d3-3dc719f511c5',
  },
  {
    name: 'BDFB-03',
    serial: 'LAB-BDFB-03',
    rack: '164fe884-28b0-4d80-b504-af92d0b80f15',
    bay: '1d7033f4-d202-4952-8858-e200280a8c47',
    older: 'EMU-BFDB-03',
    originalBinding: 'auto:mqtt:88cffc3d56c7eea4e6dc31b457d72eb20bc77d5a040cbe9190c2abba7579a9b0',
    originalTarget: '4e9b6c5a-ffc8-4d06-84b2-34845b6cdfaa',
  },
];
const METRICS = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'];
const MODE = process.env.SITEMAPPER_MQTT_COMMISSION_MODE || 'plan';
if (!['plan', 'apply'].includes(MODE)) throw Error('MODE must be plan or apply');
const d = db.getSiblingDB(DATABASE);
const t = d.topology_nodes,
  b = d.telemetry_bindings;
function assert(ok, reason) {
  if (!ok) throw Error('COMMISSION BLOCKED: ' + reason);
}
function get(id) {
  const n = t.findOne({ id });
  assert(n && n.lifecycle === 'ACTIVE', 'missing active ' + id);
  return n;
}
function descend(p, k, expectedCount) {
  assert(
    Array.isArray(p.children) && p.children.length === expectedCount,
    p.name + ' invalid positional slots ' + k,
  );
  return p.children.map((id, i) => {
    assert(typeof id === 'string', p.name + ' empty slot ' + (i + 1));
    const n = get(id);
    assert(
      n.kind === 'EQUIPMENT' &&
        n.equipmentType === k &&
        n.parentId === p.id &&
        n.parentEquipmentId === p.id &&
        n.deviceId === p.deviceId,
      p.name + ' slot ' + (i + 1) + ' has invalid equipment type/ownership',
    );
    return n;
  });
}
print('COMMISSION PREFLIGHT: validating original BDFB and MQTT source ownership');
const original = get(PRIMARY.id);
assert(
  original.kind === 'DEVICE' &&
    original.serialNumber === PRIMARY.serial &&
    original.parentId === PRIMARY.rack,
  'BDFB-01 identity/rack drift',
);
const fingerprints = TARGETS.map((x) => ({
  source: x.older,
  bindings: b
    .find(
      { protocol: 'MQTT', sourceIdentity: x.older, lifecycle: 'ACTIVE' },
      { _id: 0, id: 1, metric: 1, targetId: 1, targetType: 1 },
    )
    .toArray(),
}));
assert(
  fingerprints.every((x, i) => {
    const expected = TARGETS[i];
    return (
      x.bindings.length === 1 &&
      x.bindings[0].id === expected.originalBinding &&
      x.bindings[0].metric === 'SOURCE' &&
      x.bindings[0].targetType === 'EQUIPMENT' &&
      x.bindings[0].targetId === expected.originalTarget
    );
  }),
  'Original BDFB-01 SOURCE binding identities or targets changed',
);
for (const item of TARGETS) {
  const owner = get(item.originalTarget);
  assert(
    owner.kind === 'EQUIPMENT' &&
      owner.deviceId === PRIMARY.id &&
      owner.serialNumber === item.older,
    item.older + ' original Equipment serial ownership changed',
  );
}
const staged = [];
for (const x of TARGETS) {
  print('COMMISSION PREFLIGHT: inspect ' + x.name + ' rack and equipment');
  const rack = get(x.rack);
  const pos = get(rack.parentId);
  const bay = get(x.bay);
  assert(
    rack.kind === 'CONTAINER_RACK' &&
      rack.variant === 'RACK' &&
      pos.kind === 'POSITION' &&
      pos.parentId === x.bay &&
      bay.kind === 'CONTAINER_CLUSTER_BAY' &&
      bay.parentId === ROOM,
    x.name + ' rack/bay mismatch',
  );
  const devices = t
    .find({ kind: 'DEVICE', name: x.name, parentId: x.rack, lifecycle: 'ACTIVE' })
    .toArray();
  assert(
    devices.length === 1 &&
      devices[0].serialNumber === x.serial &&
      devices[0].deviceType === 'BDFB',
    x.name + ' expected unique LAB Device',
  );
  const device = devices[0];
  assert(
    device.attributes?.synthetic === true &&
      device.attributes?.mqttCommissioning === 'UNMAPPED_PENDING_SOURCE_CONFLICT',
    x.name + ' synthetic provenance missing',
  );
  const ownership = t
    .find({ serialNumber: x.serial, lifecycle: 'ACTIVE', kind: { $in: ['DEVICE', 'EQUIPMENT'] } })
    .toArray();
  assert(
    ownership.length === 1 && ownership[0].id === device.id,
    x.name + ' LAB source serial is not uniquely owned',
  );
  const [chassisId] = device.rootEquipmentIds || [];
  assert(device.rootEquipmentIds?.length === 1, x.name + ' must have 1 chassis');
  const chassis = get(chassisId);
  assert(
    chassis.equipmentType === 'CHASSIS' &&
      chassis.deviceId === device.id &&
      chassis.parentId === device.id &&
      chassis.parentEquipmentId === null,
    x.name + ' invalid chassis',
  );
  assert(chassis.rackPlacement?.rackId === rack.id, x.name + ' rack placement missing');
  // Legacy Mongo records may carry non-array cas. Refuse to treat an
  // unknown shape as available, rather than calling Array.prototype.some.
  assert(Array.isArray(rack.cas), x.name + ' non-array rack CAS');
  let equipped = false;
  for (const allocation of rack.cas) {
    if (allocation && allocation.state === 'EQUIPPED' && allocation.occupantId === chassisId)
      equipped = true;
  }
  assert(equipped, x.name + ' missing CAS allocation');
  const shelf = descend(chassis, 'SHELF', 1)[0];
  const frames = descend(shelf, 'FRAME', 2);
  const expected = [];
  for (const [frameIndex, frame] of frames.entries()) {
    const panels = descend(frame, 'PANEL', 2);
    for (const [panelIndex, panel] of panels.entries()) {
      const group = frameIndex * 2 + panelIndex + 1;
      const prefix = '0_' + group;
      assert(
        panel.telemetryPointPrefix === prefix,
        x.name + ' panel ' + group + ' has unexpected raw point prefix',
      );
      const breakers = descend(panel, 'CIRCUIT_BREAKER', 24);
      for (const [i, breaker] of breakers.entries()) {
        assert(
          Array.isArray(breaker.accessPorts),
          x.name + ' malformed breaker accessPorts at position ' + (i + 1),
        );
        let outputPort = false;
        for (const port of breaker.accessPorts) {
          if (
            port &&
            port.id === breaker.id + ':power-out' &&
            port.direction === 'OUTPUT' &&
            port.lifecycle === 'ACTIVE'
          ) {
            outputPort = true;
          }
        }
        assert(outputPort, x.name + ' missing breaker output port ' + (i + 1));
        const point = prefix + '_' + (i + 1);
        for (const metric of METRICS) {
          expected.push({
            id: 'lab:mqtt:' + x.serial + ':' + point + ':' + metric,
            protocol: 'MQTT',
            sourceIdentity: x.serial,
            sourcePointId: point,
            metric,
            targetType: 'EQUIPMENT',
            targetId: breaker.id,
          });
        }
      }
    }
  }
  expected.push({
    id: 'lab:mqtt:' + x.serial + ':SOURCE',
    protocol: 'MQTT',
    sourceIdentity: x.serial,
    metric: 'SOURCE',
    targetType: 'DEVICE',
    targetId: device.id,
  });
  assert(expected.length === 385, x.name + ' expected 385 lab bindings');
  print('COMMISSION PREFLIGHT: ' + x.name + ' breaker map complete (96 positions)');
  const prior = b
    .find({ protocol: 'MQTT', sourceIdentity: x.serial, lifecycle: 'ACTIVE' })
    .toArray();
  const desired = new Map(expected.map((item) => [item.id, item]));
  const consistent =
    prior.length === expected.length &&
    prior.every((item) => {
      const want = desired.get(item.id);
      return (
        want &&
        [
          'id',
          'protocol',
          'sourceIdentity',
          'sourcePointId',
          'metric',
          'targetType',
          'targetId',
        ].every((key) => (item[key] ?? null) === (want[key] ?? null))
      );
    });
  assert(
    prior.length === 0 || consistent,
    x.name + ' unexpected existing MQTT lab bindings; no partial overwrite',
  );
  staged.push({ device, expected, already: consistent });
}
print('\nSITE MAPPER / INDEPENDENT SYNTHETIC MQTT COMMISSIONING');
print('mode=' + MODE + ' DB=' + DATABASE);
for (const x of staged) {
  print(
    x.device.name +
      ' source=' +
      x.device.serialNumber +
      ' breakers=96 bindings=' +
      x.expected.length +
      ' state=' +
      (x.already ? 'ALREADY_COMMISSIONED' : 'READY'),
  );
}
for (const old of fingerprints)
  print('ORIGINAL PRESERVED ' + old.source + ' -> ' + old.bindings[0].targetId);
if (MODE === 'plan') {
  print('PLAN ONLY, 0 writes. LAB-BDFB-02/03 are separate topic and payload SNs.');
  print('When commissioned, run two synthetic LAB publishers; do NOT move EMU-BFDB bindings.');
} else {
  assert(
    process.env.SITEMAPPER_MQTT_COMMISSION_ACK === 'LAB_ONLY',
    'LAB_ONLY acknowledgment required',
  );
  assert(
    staged.every((x) => x.already) || staged.every((x) => !x.already),
    'mixed commissioned/uncommissioned state; manual review required',
  );
  if (staged.every((x) => x.already)) {
    print('ALREADY COMMISSIONED. 0 writes.');
  } else {
    const now = new Date().toISOString();
    const toInsert = staged.flatMap((item) =>
      item.expected.map((x) => ({
        ...x,
        lifecycle: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        ...(x.metric === 'SOURCE'
          ? { attributes: { synthetic: true, commissioning: 'SITE_MAPPER_LAB_V2' } }
          : { attributes: { synthetic: true, commissioning: 'SITE_MAPPER_LAB_V2' } }),
      })),
    );
    const session = db.getMongo().startSession();
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      const tx = session.getDatabase(DATABASE);
      // A unique (protocol, sourceIdentity, sourcePointId, metric) index
      // rejects concurrent claims, while the transaction avoids partial insert.
      tx.telemetry_bindings.insertMany(toInsert, { ordered: true });
      session.commitTransaction();
      print(
        'MQTT COMMISSION COMMITTED: ' +
          toInsert.length +
          ' new LAB bindings, 0 existing bindings modified.',
      );
    } catch (error) {
      try {
        session.abortTransaction();
      } catch (ignored) {}
      throw error;
    } finally {
      session.endSession();
    }
  }
}
