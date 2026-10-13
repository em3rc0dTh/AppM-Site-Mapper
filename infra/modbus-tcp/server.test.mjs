import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ModbusLatestState, handleFrame, rawPointIndex, startBridge } from './server.mjs';

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
