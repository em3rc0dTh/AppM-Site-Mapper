import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ModbusLatestState, handleFrame, rawPointIndex, startBridge } from './server.mjs';
import {
  registerMapRows,
  circuitStartAddress,
  metricStartAddress,
  pointIdForCircuit,
  totalMetricStartAddress,
  REGISTERS_PER_UNIT,
} from './register-map.mjs';

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

function command(unit, offset, count, fn = 4) {
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

test('maps client A/B blocks to exactly 96 canonical Modbus positions', () => {
  assert.equal(rawPointIndex('0_1_1'), 0);
  assert.equal(rawPointIndex('0_1_48'), 47);
  assert.equal(rawPointIndex('0_2_1'), 48);
  assert.equal(rawPointIndex('0_2_48'), 95);
  for (const malformed of ['0_5_1', '0_1_0', '0_1_49', 'garbage', ['0_1_1'], 123, null]) {
    assert.equal(rawPointIndex(malformed), null);
  }
});

test('FC04 Input Registers preserve FLOAT32 order, kW conversion and source isolation', () => {
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
  const response = handleFrame(command(1, 0, 8), state, now);
  assert.equal(response[7], 4);
  assert.equal(response[8], 16);
  assert.equal(response.readFloatBE(9), 12.5);
  assert.equal(response.readFloatBE(13), 2.5);
  assert.ok(Math.abs(response.readFloatBE(17) - 0.03) < 0.000001);
  assert.equal(response.readFloatBE(21), 1.25);
  assert.equal(handleFrame(command(2, 0, 2), state, now).readFloatBE(9), 0);
  assert.equal(handleFrame(command(2, 760, 2), state, now).readFloatBE(9), 15.5);
  assert.equal(handleFrame(command(1, 0, 2), state, now + 30001).readFloatBE(9), 0);
});

test('invalid source and out-of-map points do not corrupt Input Registers', () => {
  const state = new ModbusLatestState(sourceMap);
  assert.equal(state.apply(sample('UNTRUSTED', '0_1_1', 99)), false);
  assert.equal(state.apply(sample('EMU-BFDB-01', '0_9_1', 99)), false);
  assert.equal(state.read(1, 0, 8).every((value) => value === 0), true);
  assert.equal(handleFrame(command(1, 775, 2), state)[8], 2);
  assert.equal(handleFrame(command(1, 0, 126), state)[8], 2);
  assert.equal(handleFrame(command(1, 0, 1, 3), state)[7], 0x83);
});

test('rejects FLOAT32 overflow without partially overwriting accepted readings', () => {
  const state = new ModbusLatestState(sourceMap);
  const now = Date.now();
  assert.equal(
    state.apply(sample('EMU-BFDB-01', '0_1_1', 12.5, new Date(now).toISOString()), now),
    true,
  );
  const invalid = sample('EMU-BFDB-01', '0_1_1', 1e39, new Date(now).toISOString());
  invalid.metrics.currentA.value = 88;
  assert.equal(state.apply(invalid, now), false);
  const result = handleFrame(command(1, 0, 8), state, now);
  assert.equal(result.readFloatBE(9), 12.5);
  assert.equal(result.readFloatBE(13), 2.5);
});

test('00 total V/A/kW signals mirror commissioned QDF projection into 768..773', () => {
  const state = new ModbusLatestState(sourceMap);
  const observedAt = new Date().toISOString();
  assert.equal(
    state.applyTotalSignal(1, 'QDF/qdf-2/TOTAL_VOLTAGE', {
      quality: 'VALID',
      unit: 'V',
      value: 52.4,
      observedAt,
    }),
    true,
  );
  assert.equal(
    state.applyTotalSignal(1, 'QDF/qdf-2/TOTAL_CURRENT', {
      quality: 'VALID',
      unit: 'A',
      value: 120.5,
      observedAt,
    }),
    true,
  );
  assert.equal(
    state.applyTotalSignal(1, 'QDF/qdf-2/TOTAL_POWER', {
      quality: 'VALID',
      unit: 'kW',
      value: 6.31,
      observedAt,
    }),
    true,
  );
  const result = handleFrame(command(1, 768, 6), state);
  assert.equal(result.readFloatBE(9), 52.4);
  assert.equal(result.readFloatBE(13), 120.5);
  assert.ok(Math.abs(result.readFloatBE(17) - 6.31) < 0.00001);
});

test('00 total Energy sums all 96 breaker kWh counters at 774..775', () => {
  const state = new ModbusLatestState(sourceMap);
  const now = Date.now();
  for (let circuit = 1; circuit <= 96; circuit++) {
    assert.equal(
      state.apply(
        sample(
          'EMU-BFDB-01',
          pointIdForCircuit(circuit, 'blocks-2x48'),
          52,
          new Date(now).toISOString(),
        ),
        now,
      ),
      true,
    );
  }
  const result = handleFrame(command(1, 774, 2), state, now);
  assert.equal(result.readFloatBE(9), 120);
});

test('HTTP bridge authenticates and emits a real FC04 MBAP response', async () => {
  const app = startBridge({
    sourceMap,
    token: TOKEN,
    modbusHost: '127.0.0.1',
    modbusPort: 0,
    ingestHost: '127.0.0.1',
    ingestPort: 0,
  });
  await Promise.all([
    new Promise((resolve) => app.modbus.once('listening', resolve)),
    new Promise((resolve) => app.ingest.once('listening', resolve)),
  ]);
  const port = app.modbus.address().port;
  const url = 'http://127.0.0.1:' + app.ingest.address().port + '/internal/accepted-breaker';
  try {
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
    const accepted = await fetch(url, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' },
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
    assert.equal(data[7], 4);
    assert.equal(data.readFloatBE(9), 13.25);
  } finally {
    await app.close();
  }
});

test('legacy 4x24 layout remains available as an explicit compatibility mode', () => {
  assert.equal(rawPointIndex('0_1_1', 'panels-4x24'), 0);
  assert.equal(rawPointIndex('0_2_1', 'panels-4x24'), 24);
  assert.equal(rawPointIndex('0_3_1', 'panels-4x24'), 48);
  assert.equal(rawPointIndex('0_4_24', 'panels-4x24'), 95);
  assert.equal(rawPointIndex('0_5_1', 'panels-4x24'), null);
  assert.throws(() => new ModbusLatestState(sourceMap, 30000, 'bad-layout'), /MODBUS_POINT_LAYOUT/);
});

test('Metasys map matches Excel v1.2: 388 points/QDF, FC04 and exact offsets', () => {
  const rows = registerMapRows(sourceMap, 'blocks-2x48');
  assert.equal(rows.length, 1164);
  assert.equal(REGISTERS_PER_UNIT, 776);

  const starts = new Set();
  for (const row of rows) {
    assert.equal(row.functionCode, '04');
    assert.equal(row.dataType, 'FLOAT32');
    assert.equal(row.registerCount, 2);
    assert.equal(row.scale, 1);
    assert.equal(row.wordOrder, 'High word first');
    if (row.description.endsWith(' Power')) assert.equal(row.engineeringUnit, 'kW');
    assert.equal(row.reference, `${40001 + row.startAddress}-${40002 + row.startAddress}`);
    const key = `${row.unitId}:${row.startAddress}`;
    assert.equal(starts.has(key), false);
    starts.add(key);
  }

  assert.equal(rows[0].circuitLabel, '00');
  assert.equal(rows[0].startAddress, 768);
  assert.equal(rows[3].startAddress, 774);
  assert.equal(rows[4].circuitLabel, '01-A');
  assert.equal(rows[4].startAddress, 0);
  assert.equal(rows[4].rawPoint, '0_1_1');
  assert.equal(rows[195].circuitLabel, '48-A');
  assert.equal(rows[196].circuitLabel, '01-B');
  assert.equal(rows[196].startAddress, 384);
  assert.equal(rows[387].circuitLabel, '48-B');
  assert.equal(rows[387].startAddress, 766);
  assert.equal(rows[388].unitId, 2);
  assert.equal(rows.at(-1).unitId, 3);
  assert.equal(circuitStartAddress(96), 760);
  assert.equal(metricStartAddress(96, 'energyKwh'), 766);
  assert.equal(totalMetricStartAddress('voltageV'), 768);
  assert.equal(totalMetricStartAddress('energyKwh'), 774);
});

test('Metasys missing-data exception mode never fabricates a zero', () => {
  const now = Date.now();
  const state = new ModbusLatestState(sourceMap, 30000, 'blocks-2x48', 'exception');
  assert.equal(handleFrame(command(1, 0, 8), state, now)[7], 0x84);
  assert.equal(handleFrame(command(1, 0, 8), state, now)[8], 4);
  assert.equal(
    state.apply(sample('EMU-BFDB-01', '0_1_1', 0, new Date(now).toISOString()), now),
    true,
  );
  const valid = handleFrame(command(1, 0, 8), state, now);
  assert.equal(valid[7], 4);
  assert.equal(valid.readFloatBE(9), 0);
  assert.equal(handleFrame(command(1, 0, 16), state, now)[8], 4);
  assert.equal(handleFrame(command(1, 0, 8), state, now + 30001)[8], 4);
  assert.equal(handleFrame(command(1, 776, 1), state, now)[8], 2);
  assert.equal(handleFrame(command(1, 0, 1, 3), state, now)[8], 1);
  assert.throws(
    () => new ModbusLatestState(sourceMap, 30000, 'blocks-2x48', 'bad'),
    /MODBUS_MISSING_POLICY/,
  );
});
