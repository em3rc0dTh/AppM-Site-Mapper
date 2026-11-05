#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const die = (message, code = 2) => {
  console.error(`S05_AUDIT_ERROR: ${message}`);
  process.exit(code);
};
const normalize = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const manifestPath = arg('--manifest', '.runtime/s05-commissioning-reference.json');
const databaseName = arg('--database', process.env.SITEMAPPER_DATABASE ?? 'seed-01');
const mongoUri = arg('--mongo-uri', process.env.MONGODB_URI);
const strict = has('--strict');
const manifestOnly = has('--manifest-only');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.qdfs)) {
  die('manifest must contain schemaVersion=1 and qdfs[]');
}
for (const qdf of manifest.qdfs) {
  if (!qdf.key || !qdf.deviceName || !qdf.gateway?.name || !qdf.gateway?.serial) {
    die(`invalid QDF entry: ${JSON.stringify({ key: qdf?.key })}`);
  }
  if (!Array.isArray(qdf.meters) || !Array.isArray(qdf.breakers)) {
    die(`${qdf.key} requires meters[] and breakers[]`);
  }
}

const manifestSummary = {
  qdfs: manifest.qdfs.length,
  gateways: manifest.qdfs.length,
  meters: manifest.qdfs.reduce((count, qdf) => count + qdf.meters.length, 0),
  breakers: manifest.qdfs.reduce((count, qdf) => count + qdf.breakers.length, 0),
};

if (manifestOnly) {
  console.log(
    JSON.stringify(
      { status: 'S05_MANIFEST_VALID', readOnly: true, manifestSummary },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (!mongoUri) die('MONGODB_URI or --mongo-uri is required');

const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri, { appName: 'site-mapper-s05-readonly-audit' });
await client.connect();
const database = client.db(databaseName);

const findings = [];
const add = (kind, qdf, element, field, expected, actual, status, detail = '') => {
  findings.push({ kind, qdf, element, field, expected, actual, status, detail });
};

try {
  for (const spec of manifest.qdfs) {
    const devices = await database
      .collection('topology_nodes')
      .find({
        kind: 'DEVICE',
        lifecycle: 'ACTIVE',
        deviceType: 'BDFB',
        name: spec.deviceName,
      })
      .toArray();

    if (devices.length !== 1) {
      add('DEVICE', spec.key, spec.deviceName, 'identity', 1, devices.length, 'CONFLICT');
      continue;
    }
    const device = devices[0];

    const gateways = await database
      .collection('topology_nodes')
      .find({
        kind: 'EQUIPMENT',
        lifecycle: 'ACTIVE',
        deviceId: device.id,
        name: spec.gateway.name,
      })
      .toArray();

    if (gateways.length !== 1) {
      add('GATEWAY', spec.key, spec.gateway.name, 'identity', 1, gateways.length, 'CONFLICT');
    } else {
      add(
        'GATEWAY',
        spec.key,
        spec.gateway.name,
        'serial',
        spec.gateway.serial,
        gateways[0].serialNumber ?? null,
        String(gateways[0].serialNumber ?? '') === String(spec.gateway.serial)
          ? 'MATCH'
          : 'CONFLICT',
      );
    }

    for (const meterSpec of spec.meters) {
      const meters = await database
        .collection('topology_nodes')
        .find({
          kind: 'EQUIPMENT',
          lifecycle: 'ACTIVE',
          deviceId: device.id,
          name: meterSpec.name,
        })
        .toArray();

      if (meters.length !== 1) {
        add('METER', spec.key, meterSpec.name, 'identity', 1, meters.length, 'CONFLICT');
        continue;
      }

      const meter = meters[0];
      add(
        'METER',
        spec.key,
        meterSpec.name,
        'serial',
        meterSpec.serial,
        meter.serialNumber ?? null,
        String(meter.serialNumber ?? '') === String(meterSpec.serial) ? 'MATCH' : 'CONFLICT',
      );

      const slaveAlias = (meter.aliases ?? []).find((value) =>
        /^RS485 slave\s+\d+$/i.test(String(value)),
      );
      const actualSlave = slaveAlias ? Number(String(slaveAlias).match(/\d+$/)?.[0]) : null;
      add(
        'METER',
        spec.key,
        meterSpec.name,
        'slaveId',
        meterSpec.slaveId,
        actualSlave,
        actualSlave === meterSpec.slaveId ? 'MATCH' : 'CONFLICT',
      );
    }

    const panels = {};
    for (const panelName of ['A3', 'B3']) {
      const rows = await database
        .collection('topology_nodes')
        .find({
          kind: 'EQUIPMENT',
          lifecycle: 'ACTIVE',
          deviceId: device.id,
          equipmentType: 'PANEL',
          name: panelName,
        })
        .toArray();
      panels[panelName] = rows.length === 1 ? rows[0] : null;
      if (rows.length !== 1) {
        add('PANEL', spec.key, panelName, 'identity', 1, rows.length, 'CONFLICT');
      }
    }

    for (const breakerSpec of spec.breakers) {
      const panel = panels[breakerSpec.panel];
      const label = `${breakerSpec.panel}-${String(breakerSpec.position).padStart(2, '0')}`;
      if (!panel || !Array.isArray(panel.children)) {
        add('BREAKER', spec.key, label, 'position', 'occupied', null, 'MISSING_IN_RUNTIME');
        continue;
      }

      const breakerId = panel.children[breakerSpec.position - 1];
      if (!breakerId) {
        add(
          'BREAKER',
          spec.key,
          label,
          'destination',
          breakerSpec.destination,
          null,
          'MISSING_IN_RUNTIME',
        );
        continue;
      }

      const breaker = await database
        .collection('topology_nodes')
        .findOne({ id: breakerId, lifecycle: 'ACTIVE' });
      if (!breaker || breaker.equipmentType !== 'CIRCUIT_BREAKER') {
        add(
          'BREAKER',
          spec.key,
          label,
          'type',
          'CIRCUIT_BREAKER',
          breaker?.equipmentType ?? null,
          'CONFLICT',
        );
        continue;
      }

      const aliases = (breaker.aliases ?? []).map(normalize);
      add(
        'BREAKER',
        spec.key,
        label,
        'destination',
        breakerSpec.destination,
        breaker.aliases?.[0] ?? breaker.name,
        aliases.includes(normalize(breakerSpec.destination)) ? 'MATCH' : 'CONFLICT',
      );
    }

    const mqtt = await database
      .collection('telemetry_bindings')
      .find({
        lifecycle: 'ACTIVE',
        protocol: 'MQTT',
        sourceIdentity: spec.gateway.serial,
      })
      .toArray();
    const sourceBindings = mqtt.filter(
      (binding) => !binding.sourcePointId && normalize(binding.metric) === 'SOURCE',
    );
    add(
      'MQTT',
      spec.key,
      spec.gateway.name,
      'sourceBindings',
      '<=1',
      sourceBindings.length,
      sourceBindings.length <= 1 ? 'MATCH' : 'CONFLICT',
    );
    add(
      'MQTT',
      spec.key,
      spec.gateway.name,
      'metricBindings',
      'report-only',
      mqtt.filter((binding) => binding.sourcePointId).length,
      'OBSERVED',
    );
  }

  const duplicates = await database
    .collection('telemetry_bindings')
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
          ids: { $addToSet: '$id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  add(
    'BINDINGS',
    'ALL',
    'telemetry_bindings',
    'duplicateSourcePoints',
    0,
    duplicates.length,
    duplicates.length === 0 ? 'MATCH' : 'CONFLICT',
    duplicates.length ? JSON.stringify(duplicates) : '',
  );

  const snmpObserved = await database
    .collection('telemetry_bindings')
    .aggregate([
      { $match: { lifecycle: 'ACTIVE', protocol: 'SNMP' } },
      {
        $group: {
          _id: '$sourceIdentity',
          count: { $sum: 1 },
          metrics: { $push: '$metric' },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const counts = findings.reduce((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});

  console.log(
    JSON.stringify(
      {
        status:
          counts.CONFLICT || counts.MISSING_IN_RUNTIME
            ? 'S05_DIFF_REQUIRES_REVIEW'
            : 'S05_DIFF_MATCH',
        readOnly: true,
        database: databaseName,
        manifestSummary,
        counts,
        snmpObserved,
        findings,
      },
      null,
      2,
    ),
  );

  if (strict && (counts.CONFLICT || counts.MISSING_IN_RUNTIME)) process.exitCode = 10;
} finally {
  await client.close();
}
