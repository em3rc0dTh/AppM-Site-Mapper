import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { ExtensionState, validateRegistry, QUALITY_CODES, registryCsv } from './point-registry.mjs';
import { startBridge } from './server.mjs';
const point = {
  signalId: 'a'.repeat(64),
  unitId: 1,
  address: 1024,
  unit: 'V',
  description: 'Additional voltage',
};
const registry = { version: 1, points: [point] };
test('immutable registry rejects collisions, address drift, version regression and removal', () => {
  assert.throws(() => validateRegistry({ version: 1, points: [{ ...point, address: 0 }] }));
  assert.throws(() =>
    validateRegistry({
      version: 1,
      points: [point, { ...point, signalId: 'b'.repeat(64), address: 1025 }],
    }),
  );
  assert.throws(() =>
    validateRegistry({ version: 2, points: [{ ...point, address: 1027 }] }, registry),
  );
  assert.throws(() => validateRegistry({ version: 2, points: [] }, registry));
  const fourth = { ...point, signalId: 'd'.repeat(64), unitId: 4 };
  assert.equal(
    validateRegistry({ version: 2, points: [point, fourth] }, registry).points[0].address,
    1024,
  );
  assert.match(registryCsv(registry), /qualityAddress0/);
});
test('extension distinguishes missing, zero, stale, invalid, alarm and unknown', () => {
  const state = new ExtensionState(registry),
    now = Date.now();
  let regs = state.read(1, 1024, 3, now);
  assert.equal(regs[2], QUALITY_CODES.UNOBSERVED);
  const s = {
    id: point.signalId,
    receivedAt: new Date(now).toISOString(),
    observedAt: new Date(now).toISOString(),
    staleMs: 1000,
    quality: 'VALID',
    kind: 'measurement',
    unit: 'V',
    value: 0,
  };
  assert.equal(state.apply(s), true);
  assert.deepEqual(state.read(1, 1024, 3, now), [0, 0, 1]);
  assert.equal(state.read(1, 1024, 3, now + 1001)[2], 2);
  assert.equal(state.read(1, 1023, 3, now), null);
  state.apply({ ...s, quality: 'UNKNOWN' });
  assert.equal(state.read(1, 1024, 3, now)[2], 4);
  state.apply({ ...s, kind: 'state', value: 'unmapped-label' });
  assert.equal(state.read(1, 1024, 3, now)[2], QUALITY_CODES.INVALID);
  state.apply({ ...s, unit: 'A' });
  assert.equal(state.read(1, 1024, 3, now)[2], 3);
  state.apply({ ...s, kind: 'alarm', alarmState: 'ACTIVE', unit: null });
  assert.deepEqual(state.read(1, 1024, 3, now), [0x3f80, 0, 1]);
  assert.equal(state.apply({ ...s, observedAt: new Date(now - 1000).toISOString() }), false);
});
test('independent TCP client reads extension and unchanged legacy addresses', async () => {
  const bridge = startBridge({
    sourceMap: { 'EMU-1': 1 },
    token: 'lab-token-for-modbus-only-123456789',
    registry,
    modbusPort: 0,
    ingestPort: 0,
  });
  await Promise.all([once(bridge.modbus, 'listening'), once(bridge.ingest, 'listening')]);
  const now = new Date().toISOString();
  bridge.state.apply({
    sourceIdentity: 'EMU-1',
    rawPointId: '0_1_1',
    receivedAt: now,
    metrics: { voltageV: { value: 12 } },
  });
  bridge.state.extensions.apply({
    id: point.signalId,
    receivedAt: now,
    observedAt: now,
    staleMs: 30000,
    quality: 'VALID',
    kind: 'measurement',
    unit: 'V',
    value: 48,
  });
  const client = net.connect(bridge.modbus.address().port, '127.0.0.1');
  await once(client, 'connect');
  try {
    for (const [address, expected] of [
      [0, 12],
      [1024, 48],
    ]) {
      const packet = Buffer.from([0, 1, 0, 0, 0, 6, 1, 3, 0, 0, 0, 2]);
      packet.writeUInt16BE(address, 8);
      const received = once(client, 'data');
      client.write(packet);
      const [reply] = await received;
      assert.equal(reply[7], 3);
      assert.equal(reply.readFloatBE(9), expected);
    }
  } finally {
    client.destroy();
    await bridge.close();
  }
});
