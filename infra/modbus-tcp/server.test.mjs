import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ModbusLatestState, handleFrame, rawPointIndex, startBridge } from './server.mjs';
import { registerMapRows, circuitStartAddress, metricStartAddress, pointIdForCircuit, REGISTERS_PER_UNIT } from './register-map.mjs';

const TOKEN = 'ci-modbus-only-secret-token-2026';
const sourceMap = { 'EMU-BFDB-01': 1, 'EMU-BFDB-02': 2, 'EMU-BFDB-03': 3 };
function sample(serial, point, value, at = new Date().toISOString()) {
  return {
    sourceIdentity: serial,
    rawPointId: point,
    receivedAt: at,
    metrics: {
      voltageV: { value },
      currentA: { value: 2.5 },
      powerW: { value: 30 },
      energyKwh: { value: 1.25 },
    },
  };
}
function command(unit, offset, count, fn = 3) {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(42, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame[6] = unit;
  frame[7] = fn;
  frame.writeUInt16BE(offset, 8);
  frame.writeUInt16BE(count, 10);
  return frame;
}

test('maps two BFDB blocks of 48 circuits to exactly 96 positions', () => {
  assert.equal(rawPointIndex('0_1_1'), 0);
  assert.equal(rawPointIndex('0_1_25'), 24);
  assert.equal(rawPointIndex('0_2_24'), 71);
  assert.equal(rawPointIndex('0_2_48'), 95);
  for (const malformed of ['0_5_1', '0_1_0', '0_1_49', 'garbage']) {
    assert.equal(rawPointIndex(malformed), null);
  }
});

test('holding registers preserve FLOAT32 network byte order, source isolation and staleness', () => {
  const state = new ModbusLatestState(sourceMap);
  const now = Date.now();
  assert.equal(
    state.apply(sample('EMU-BFDB-01', '0_1_1', 12.5, new Date(now).toISOString()), now),
    true,
  );
  assert.equal(
    state.apply(sample('EMU-BFDB-02', '0_2_48', 15.5, new Date(now).toISOString()), now),
    true,
  );
  const r = handleFrame(command(1, 0, 8), state, now);
  assert.equal(r[7], 3);
  assert.equal(r[8], 16);
  assert.equal(r.readFloatBE(9), 12.5);
  assert.equal(r.readFloatBE(13), 2.5);
  assert.equal(r.readFloatBE(17), 30);
  assert.equal(r.readFloatBE(21), 1.25);
  assert.equal(handleFrame(command(2, 0, 2), state, now).readFloatBE(9), 0);
  assert.equal(handleFrame(command(2, 760, 2), state, now).readFloatBE(9), 15.5);
  assert.equal(handleFrame(command(1, 0, 2), state, now + 30001).readFloatBE(9), 0);
});

test('invalid source and out-of-map points do not corrupt holding registers', () => {
  const state = new ModbusLatestState(sourceMap);
  assert.equal(state.apply(sample('UNTRUSTED', '0_1_1', 99)), false);
  assert.equal(state.apply(sample('EMU-BFDB-01', '0_9_1', 99)), false);
  assert.equal(
    state.read(1, 0, 8).every((x) => x === 0),
    true,
  );
  assert.equal(handleFrame(command(1, 767, 2), state)[8], 2);
  assert.equal(handleFrame(command(1, 0, 126), state)[8], 2);
  assert.equal(handleFrame(command(1, 0, 1, 6), state)[7], 0x86);
});

test('HTTP bridge authenticates and Modbus TCP emits a real MBAP response', async () => {
  const app = startBridge({
    sourceMap,
    token: TOKEN,
    modbusHost: '127.0.0.1',
    modbusPort: 0,
    ingestHost: '127.0.0.1',
    ingestPort: 0,
  });
  await Promise.all([
    new Promise((r) => app.modbus.once('listening', r)),
    new Promise((r) => app.ingest.once('listening', r)),
  ]);
  const port = app.modbus.address().port;
  const url = 'http://127.0.0.1:' + app.ingest.address().port + '/internal/accepted-breaker';
  try {
    const unauthorized = await fetch(url, { method: 'POST', body: '{}' });
    assert.equal(unauthorized.status, 401);
    const accepted = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + TOKEN,
        'content-type': 'application/json',
      },
      body: JSON.stringify(sample('EMU-BFDB-03', '0_1_1', 13.25)),
    });
    assert.equal(accepted.status, 202);
    const data = await new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => socket.write(command(3, 0, 8)));
      socket.once('data', (bytes) => {
        socket.destroy();
        resolve(bytes);
      });
      socket.once('error', reject);
    });
    assert.equal(data.readUInt16BE(0), 42);
    assert.equal(data[6], 3);
    assert.equal(data.readFloatBE(9), 13.25);
    assert.equal(data.readFloatBE(13), 2.5);
  } finally {
    await app.close();
  }
});

test('four 24-position panels use distinct registers without affecting legacy block layout', () => {
  assert.equal(rawPointIndex('0_1_1', 'panels-4x24'), 0);
  assert.equal(rawPointIndex('0_1_24', 'panels-4x24'), 23);
  assert.equal(rawPointIndex('0_2_1', 'panels-4x24'), 24);
  assert.equal(rawPointIndex('0_2_24', 'panels-4x24'), 47);
  assert.equal(rawPointIndex('0_3_1', 'panels-4x24'), 48);
  assert.equal(rawPointIndex('0_4_24', 'panels-4x24'), 95);
  assert.equal(rawPointIndex('0_1_25', 'panels-4x24'), null);
  assert.equal(rawPointIndex('0_5_1', 'panels-4x24'), null);
  assert.equal(rawPointIndex('0_2_24', 'blocks-2x48'), 71);
  const state = new ModbusLatestState(sourceMap, 30000, 'panels-4x24');
  const now = Date.now();
  assert.equal(
    state.apply(sample('EMU-BFDB-01', '0_4_24', 14.75, new Date(now).toISOString()), now),
    true,
  );
  assert.equal(handleFrame(command(1, 760, 2), state, now).readFloatBE(9), 14.75);
  assert.equal(handleFrame(command(1, 0, 2), state, now).readFloatBE(9), 0);
  assert.throws(() => new ModbusLatestState(sourceMap, 30000, 'bad-layout'), /MODBUS_POINT_LAYOUT/);
});

test('Metasys table has precisely four FLOAT32 measurements per circuit and stable FC03 offsets', () => {
  const rows = registerMapRows(sourceMap, 'panels-4x24');
  assert.equal(rows.length, 1152);
  assert.equal(REGISTERS_PER_UNIT, 768);
  const starts = new Set();
  for (const row of rows) {
    assert.equal(row.functionCode, '03');
    assert.equal(row.dataType, 'FLOAT32');
    assert.equal(row.registerCount, 2);
    assert.equal(row.scale, 1);
    assert.equal(row.wordOrder, 'High word first');
    assert.equal(row.rawPoint, pointIdForCircuit(row.circuit, 'panels-4x24'));
    assert.equal(row.reference, `${40001 + row.startAddress}-${40002 + row.startAddress}`);
    assert.equal(row.startAddress, metricStartAddress(row.circuit,
      { Voltage: 'voltageV', Current: 'currentA', Power: 'powerW', Energy: 'energyKwh' }[row.description.split(' ').at(-1)]));
    const key = `${row.unitId}:${row.startAddress}`;
    assert.equal(starts.has(key), false);
    starts.add(key);
  }
  assert.equal(rows[0].startAddress, 0);
  assert.equal(rows[0].reference, '40001-40002');
  assert.equal(rows[383].startAddress, 766);
  assert.equal(rows[383].reference, '40767-40768');
  assert.equal(rows[384].unitId, 2);
  assert.equal(rows.at(-1).unitId, 3);
  assert.equal(rows.at(-1).rawPoint, '0_4_24');
  assert.equal(circuitStartAddress(96), 760);
  assert.equal(rawPointIndex('0_4_24', 'panels-4x24'), 95);
});

test('Metasys missing-data exception mode never fabricates a zero', () => {
  const now = Date.now();
  const state = new ModbusLatestState(sourceMap, 30000, 'panels-4x24', 'exception');
  assert.equal(handleFrame(command(1, 0, 8), state, now)[7], 0x83);
  assert.equal(handleFrame(command(1, 0, 8), state, now)[8], 4); // unavailable
  assert.equal(state.apply(sample('EMU-BFDB-01', '0_1_1', 0, new Date(now).toISOString()), now), true);
  const valid = handleFrame(command(1, 0, 8), state, now);
  assert.equal(valid[7], 3);
  assert.equal(valid.readFloatBE(9), 0); // a legitimate measured zero is preserved
  assert.equal(handleFrame(command(1, 0, 16), state, now)[8], 4); // sparse block
  assert.equal(handleFrame(command(1, 0, 8), state, now + 30001)[8], 4); // stale
  assert.equal(handleFrame(command(1, 768, 1), state, now)[8], 2); // invalid address
  assert.equal(handleFrame(command(1, 0, 1, 4), state, now)[8], 1); // FC04 not offered
  assert.throws(() => new ModbusLatestState(sourceMap, 30000, 'panels-4x24', 'bad'), /MODBUS_MISSING_POLICY/);
});
