#!/usr/bin/env node
// Read-only certification: exact breaker TimescaleDB history vs Modbus TCP FC03.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import net from 'node:net';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error('Missing --' + name);
  return v;
}
const source = arg('source');
const point = arg('point');
const breaker = arg('breaker');
const compose = arg('compose', 'docker-compose.telemetry.yml');
const host = arg('host', '127.0.0.1');
const port = Number(arg('port', '1503'));
const seconds = Number(arg('seconds', '45'));
if (!source || !/^[a-zA-Z0-9_-]{1,120}$/.test(source)) throw new Error('Valid --source required');
if (!point || !/^0_[1-4]_([1-9]|1[0-9]|2[0-4])$/.test(point))
  throw new Error('4x24 --point required');
if (!breaker || !/^[0-9a-f-]{36}$/i.test(breaker)) throw new Error('Valid --breaker UUID required');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120)
  throw new Error('Invalid --seconds');

function docker(...args) {
  return execFileSync('docker', ['compose', '-f', compose, ...args], {
    encoding: 'utf8',
    timeout: 12000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
const config = JSON.parse(
  docker(
    'exec',
    '-T',
    'modbus-tcp',
    'node',
    '-e',
    'const m=JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON||"{}");process.stdout.write(JSON.stringify({unit:m[process.argv[1]]??null,layout:process.env.MODBUS_POINT_LAYOUT||"blocks-2x48"}))',
    source,
  ),
);
if (!Number.isInteger(config.unit) || config.unit < 1 || config.unit > 247) {
  throw new Error('Source not in MODBUS_SOURCE_UNITS_JSON');
}
if (config.layout !== 'panels-4x24') throw new Error('Expected MODBUS_POINT_LAYOUT=panels-4x24');
const [, panel, position] = point.split('_').map(Number);
const circuit = (panel - 1) * 24 + position;
const offset = (circuit - 1) * 8;

function readFC03() {
  return new Promise((resolve, reject) => {
    const req = Buffer.alloc(12);
    req.writeUInt16BE(0x4342, 0);
    req.writeUInt16BE(6, 4);
    req[6] = config.unit;
    req[7] = 3;
    req.writeUInt16BE(offset, 8);
    req.writeUInt16BE(8, 10);
    const socket = net.connect({ host, port }, () => socket.write(req));
    let buf = Buffer.alloc(0);
    let done = false;
    function finish(error, result) {
      if (done) return;
      done = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    }
    socket.setTimeout(2500, () => finish(new Error('TCP timeout')));
    socket.on('error', (error) => finish(error));
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 7) return;
      const total = 6 + buf.readUInt16BE(4);
      if (total < 9 || total > 260) return finish(new Error('Invalid MBAP length'));
      if (buf.length < total) return;
      try {
        assert.equal(buf.readUInt16BE(0), 0x4342);
        assert.equal(buf.readUInt16BE(2), 0);
        assert.equal(buf[6], config.unit);
        if (buf[7] === 0x83) throw new Error('Modbus exception ' + buf[8]);
        assert.equal(buf[7], 3);
        assert.equal(buf[8], 16);
        assert.equal(total, 25);
        finish(
          null,
          [9, 13, 17, 21].map((n) => buf.readFloatBE(n)),
        );
      } catch (error) {
        finish(error);
      }
    });
  });
}
function recentHistory() {
  const sql = [
    'SELECT voltage_v,current_a,power_w,energy_kwh FROM telemetry_samples',
    "WHERE source_identity='" + source + "' AND raw_point_id='" + point + "'",
    "AND breaker_id='" + breaker + "'",
    "AND received_at >= NOW() - INTERVAL '2 minutes'",
    'ORDER BY received_at DESC LIMIT 60;',
  ].join(' ');
  return docker(
    'exec',
    '-T',
    'timescaledb',
    'psql',
    '-U',
    'site_mapper',
    '-d',
    'site_mapper_telemetry',
    '-At',
    '-F',
    '|',
    '-c',
    sql,
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|').map((value) => (value === '' ? NaN : Number(value))))
    .filter((v) => v.length === 4 && v.every(Number.isFinite));
}
function matches(values, candidate) {
  return values.every(
    (value, i) =>
      Math.abs(value - candidate[i]) <= Math.max(0.0002, Math.abs(candidate[i]) * 0.00001),
  );
}
const labels = ['voltageV', 'currentA', 'powerW', 'energyKwh'];
console.log(
  'MODBUS_CERT_START',
  JSON.stringify({
    source,
    point,
    breaker,
    unit: config.unit,
    circuit,
    offset,
    host,
    port,
    layout: config.layout,
  }),
);
const until = Date.now() + seconds * 1000;
let lastRead = null;
while (Date.now() < until) {
  try {
    const values = await readFC03();
    lastRead = values;
    const rows = recentHistory();
    if (values.some((value) => value !== 0) && rows.some((row) => matches(values, row))) {
      console.log(
        'MODBUS_CERT_PASS',
        JSON.stringify({
          source,
          point,
          breaker,
          unit: config.unit,
          address: offset,
          metrics: Object.fromEntries(labels.map((label, i) => [label, values[i]])),
          matchedRecentBreakerHistory: true,
          candidatesChecked: rows.length,
        }),
      );
      process.exit(0);
    }
    console.log(
      'WAITING_MODBUS_HISTORY_MATCH',
      JSON.stringify({ values, historyRows: rows.length }),
    );
  } catch (error) {
    console.log('WAITING_MODBUS', error instanceof Error ? error.message : String(error));
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
console.error(
  'MODBUS_CERT_FAILED',
  JSON.stringify({
    source,
    point,
    breaker,
    unit: config.unit,
    lastRead,
    hint: 'Check modbus-tcp logs, MODBUS_BRIDGE_TOKEN, MQTT freshness and exact TimescaleDB breaker rows.',
  }),
);
process.exitCode = 1;
