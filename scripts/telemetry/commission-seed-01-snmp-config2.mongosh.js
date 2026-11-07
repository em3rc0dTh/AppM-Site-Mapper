/*
 * AppManager SiteMapper Mk2 / seed-01
 * Synthetic SNMP Config2 commissioning for the three real QDF topology Devices.
 *
 * Default mode is PLAN (read-only).
 * APPLY requires:
 *   SITEMAPPER_SEED01_SNMP_CONFIG2_MODE=apply
 *   SITEMAPPER_SEED01_SNMP_CONFIG2_ACK=SYNTHETIC_LAB_ONLY
 *
 * This script:
 * - does NOT create Device or Equipment nodes;
 * - does NOT modify MQTT, Modbus or breaker bindings;
 * - adds exactly two POWER INPUT AccessPorts (A/B) to each existing CHASSIS;
 * - adds CURRENT/VOLTAGE SNMP bindings for Config2 OIDs under ...2026.48;
 * - selects ELTEK_BDCBB_CONFIG_2 on the existing BDFB Device;
 * - marks every created port/binding SYNTHETIC_LAB_ONLY.
 */

const DATABASE = process.env.MONGODB_DB_NAME || 'seed-01';
const MODE = process.env.SITEMAPPER_SEED01_SNMP_CONFIG2_MODE || 'plan';
const ACK = process.env.SITEMAPPER_SEED01_SNMP_CONFIG2_ACK || '';
const MARK = 'SEED_01_SNMP_CONFIG2_V1';
const PROFILE = 'ELTEK_BDCBB_CONFIG_2';

const SOURCES = {
  'QDF-2': 'EMU-DELTA-BFDB-01',
  'QDF-4': 'EMU-DELTA-BFDB-02',
  'QDF-5': 'EMU-DELTA-BFDB-03',
};

const SIDES = [
  {
    side: 'A',
    panels: ['A3', 'A2'],
    currentOid: '1.3.6.1.4.1.8072.9999.2026.48.1.1.0',
    voltageOid: '1.3.6.1.4.1.8072.9999.2026.48.2.1.0',
  },
  {
    side: 'B',
    panels: ['B3', 'B2'],
    currentOid: '1.3.6.1.4.1.8072.9999.2026.48.1.2.0',
    voltageOid: '1.3.6.1.4.1.8072.9999.2026.48.2.2.0',
  },
];

function assert(ok, reason) {
  if (!ok) throw new Error('SEED01 SNMP CONFIG2 BLOCKED: ' + reason);
}

assert(['plan', 'apply'].includes(MODE), 'mode must be plan or apply');
if (MODE === 'apply') {
  assert(ACK === 'SYNTHETIC_LAB_ONLY', 'explicit SYNTHETIC_LAB_ONLY acknowledgement required');
}

function collect(dbh) {
  const state = dbh.runtime_seed_state.findOne({ _id: 'seed-01', status: 'APPLIED' });
  assert(state && state.version >= 8, 'seed-01 v8+ runtime state required');
  assert(Array.isArray(state.bdfbs) && state.bdfbs.length === 3, 'expected exactly three QDF rows');

  const planned = [];

  for (const row of state.bdfbs) {
    const sourceIdentity = SOURCES[row.key];
    assert(sourceIdentity, 'unsupported QDF key ' + row.key);

    const device = dbh.topology_nodes.findOne({
      id: row.deviceId,
      kind: 'DEVICE',
      deviceType: 'BDFB',
      lifecycle: 'ACTIVE',
    });
    assert(device, row.key + ' active BDFB Device missing');

    const existingProfile = device.attributes?.bdfbHardwareProfile ?? null;
    assert(
      existingProfile === null || existingProfile === PROFILE,
      row.key + ' already selects incompatible hardware profile ' + existingProfile,
    );

    const equipment = dbh.topology_nodes
      .find({
        kind: 'EQUIPMENT',
        deviceId: device.id,
        lifecycle: 'ACTIVE',
      })
      .toArray();

    const chassis = equipment.filter((item) => item.equipmentType === 'CHASSIS');
    assert(chassis.length === 1, row.key + ' must have exactly one active CHASSIS');
    const owner = chassis[0];

    const panelsByName = new Map(
      equipment
        .filter((item) => item.equipmentType === 'PANEL')
        .map((item) => [item.name, item]),
    );

    for (const side of SIDES) {
      for (const panelName of side.panels) {
        assert(panelsByName.has(panelName), row.key + ' missing PANEL ' + panelName);
      }
    }

    const ports = SIDES.map((side) => ({
      id: 'seed01:snmp-config2:' + row.key + ':feed:' + side.side,
      deviceId: device.id,
      equipmentId: owner.id,
      name: 'SNMP INPUT ' + side.side,
      portType: 'POWER',
      direction: 'INPUT',
      exposure: 'EXTERNAL',
      protocol: 'SNMP',
      lifecycle: 'ACTIVE',
      attributes: {
        snmpFeedInput: true,
        feed: side.side,
        independentInputConfirmed: false,
        servedPanelIds: side.panels.map((name) => panelsByName.get(name).id),
        commissioning: 'SYNTHETIC_LAB_ONLY',
        labMark: MARK,
        synthetic: true,
        hardwareProfile: PROFILE,
      },
    }));

    const expectedBindings = [];
    for (let i = 0; i < SIDES.length; i += 1) {
      const side = SIDES[i];
      const port = ports[i];
      for (const point of [
        { metric: 'CURRENT', oid: side.currentOid, unit: 'A' },
        { metric: 'VOLTAGE', oid: side.voltageOid, unit: 'V' },
      ]) {
        expectedBindings.push({
          id:
            'seed01:snmp-config2:' +
            row.key +
            ':' +
            side.side +
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
            bdfbDeviceId: device.id,
            equipmentId: owner.id,
            feedName: port.name,
          },
        });
      }
    }

    const currentPorts = Array.isArray(owner.accessPorts) ? owner.accessPorts : [];
    const foreignSnmpInputs = currentPorts.filter(
      (port) =>
        port?.lifecycle === 'ACTIVE' &&
        port?.portType === 'POWER' &&
        port?.direction === 'INPUT' &&
        port?.exposure === 'EXTERNAL' &&
        port?.attributes?.snmpFeedInput === true &&
        port?.attributes?.labMark !== MARK,
    );
    assert(
      foreignSnmpInputs.length === 0,
      row.key + ' already has foreign SNMP POWER INPUT inventory',
    );

    const currentLabPorts = currentPorts.filter((port) => port?.attributes?.labMark === MARK);
    const activeSourceBindings = dbh.telemetry_bindings
      .find({
        protocol: 'SNMP',
        sourceIdentity,
        lifecycle: 'ACTIVE',
      })
      .toArray();

    const samePorts =
      currentLabPorts.length === ports.length &&
      ports.every((expected) => {
        const actual = currentLabPorts.find((port) => port.id === expected.id);
        return (
          actual &&
          actual.deviceId === expected.deviceId &&
          actual.equipmentId === expected.equipmentId &&
          actual.name === expected.name &&
          actual.portType === expected.portType &&
          actual.direction === expected.direction &&
          actual.exposure === expected.exposure &&
          actual.protocol === expected.protocol &&
          actual.lifecycle === expected.lifecycle &&
          JSON.stringify(actual.attributes) === JSON.stringify(expected.attributes)
        );
      });

    const sameBindings =
      activeSourceBindings.length === expectedBindings.length &&
      expectedBindings.every((expected) => {
        const actual = activeSourceBindings.find((binding) => binding.id === expected.id);
        return (
          actual &&
          actual.protocol === expected.protocol &&
          actual.sourceIdentity === expected.sourceIdentity &&
          actual.sourcePointId === expected.sourcePointId &&
          actual.metric === expected.metric &&
          actual.unit === expected.unit &&
          actual.targetType === expected.targetType &&
          actual.targetId === expected.targetId &&
          actual.lifecycle === 'ACTIVE' &&
          actual.attributes?.labMark === MARK &&
          actual.attributes?.commissioning === 'SYNTHETIC_LAB_ONLY'
        );
      });

    const empty = currentLabPorts.length === 0 && activeSourceBindings.length === 0;
    const ready = samePorts && sameBindings && existingProfile === PROFILE;

    assert(
      empty || ready,
      row.key + ' has partial/conflicting SNMP Config2 state; refusing overwrite',
    );

    // Protect source OIDs and target IDs from collision outside this lab mark.
    for (const expected of expectedBindings) {
      const sourceClaims = dbh.telemetry_bindings
        .find({
          protocol: 'SNMP',
          sourceIdentity: expected.sourceIdentity,
          sourcePointId: expected.sourcePointId,
          metric: expected.metric,
          lifecycle: 'ACTIVE',
          id: { $ne: expected.id },
        })
        .toArray();
      assert(sourceClaims.length === 0, row.key + ' OID already claimed: ' + expected.sourcePointId);

      const idClaims = dbh.telemetry_bindings.find({ id: expected.id }).toArray();
      assert(
        idClaims.length === 0 ||
          (idClaims.length === 1 &&
            idClaims[0].targetId === expected.targetId &&
            idClaims[0].attributes?.labMark === MARK),
        row.key + ' binding id collision: ' + expected.id,
      );
    }

    planned.push({
      row,
      device,
      chassis: owner,
      ports,
      bindings: expectedBindings,
      state: ready ? 'ALREADY_READY' : 'READY',
    });
  }

  return planned;
}

const dbh = db.getSiblingDB(DATABASE);
const plan = collect(dbh);

print(
  JSON.stringify({
    mode: MODE,
    database: DATABASE,
    profile: PROFILE,
    qdfs: plan.map((item) => ({
      qdf: item.row.key,
      sourceIdentity: SOURCES[item.row.key],
      state: item.state,
      ports: item.ports.map((port) => ({
        id: port.id,
        side: port.attributes.feed,
        servedPanelIds: port.attributes.servedPanelIds,
      })),
      bindings: item.bindings.map((binding) => ({
        id: binding.id,
        metric: binding.metric,
        oid: binding.sourcePointId,
        targetId: binding.targetId,
      })),
    })),
    syntheticOnly: true,
    physicalVerification: false,
  }),
);

if (MODE === 'plan') quit(0);

if (plan.every((item) => item.state === 'ALREADY_READY')) {
  print('ALREADY READY · 0 writes');
  quit(0);
}
assert(plan.every((item) => item.state === 'READY'), 'mixed READY/ALREADY_READY state requires review');

const session = db.getMongo().startSession();
try {
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });

  const tx = session.getDatabase(DATABASE);
  const verified = collect(tx);
  assert(verified.every((item) => item.state === 'READY'), 'state changed before commit');

  const now = new Date().toISOString();

  for (const item of verified) {
    const deviceResult = tx.topology_nodes.updateOne(
      {
        _id: item.device._id,
        lifecycle: 'ACTIVE',
        updatedAt: item.device.updatedAt,
      },
      {
        $set: {
          attributes: {
            ...(item.device.attributes || {}),
            bdfbHardwareProfile: PROFILE,
          },
          updatedAt: now,
        },
      },
    );
    assert(deviceResult.matchedCount === 1, item.row.key + ' Device changed concurrently');

    const existingPorts = Array.isArray(item.chassis.accessPorts) ? item.chassis.accessPorts : [];
    const preserved = existingPorts.filter((port) => port?.attributes?.labMark !== MARK);
    const chassisResult = tx.topology_nodes.updateOne(
      {
        _id: item.chassis._id,
        lifecycle: 'ACTIVE',
        updatedAt: item.chassis.updatedAt,
      },
      {
        $set: {
          accessPorts: [...preserved, ...item.ports],
          updatedAt: now,
        },
      },
    );
    assert(chassisResult.matchedCount === 1, item.row.key + ' CHASSIS changed concurrently');

    tx.telemetry_bindings.insertMany(
      item.bindings.map((binding) => ({
        ...binding,
        createdAt: now,
        updatedAt: now,
      })),
      { ordered: true },
    );
  }

  session.commitTransaction();
  print(
    'SNMP CONFIG2 COMMITTED · 3 QDF Devices · 6 synthetic POWER INPUT ports · 12 synthetic bindings · MQTT/Modbus untouched',
  );
} catch (error) {
  try {
    session.abortTransaction();
  } catch (_) {}
  throw error;
} finally {
  session.endSession();
}
