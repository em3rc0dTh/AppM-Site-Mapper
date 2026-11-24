import assert from 'node:assert/strict';
import net from 'node:net';

const host = process.env.MODBUS_TEST_HOST || '127.0.0.1';
const port = Number(process.env.MODBUS_TEST_PORT || 1502);

function command(unit, offset, count) {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(713, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame[6] = unit;
  frame[7] = 4;
  frame.writeUInt16BE(offset, 8);
  frame.writeUInt16BE(count, 10);
  return frame;
}

async function read(unit, offset, count = 3) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => socket.write(command(unit, offset, count)));
    socket.setTimeout(2500, () => socket.destroy(new Error('Modbus v1.3 read timed out')));
    socket.once('data', (bytes) => {
      socket.destroy();
      if (bytes.readUInt16BE(0) !== 713 || bytes[6] !== unit || bytes[7] !== 4) {
        reject(new Error(`Unexpected Modbus response unit=${unit} offset=${offset}`));
        return;
      }
      resolve({
        value: bytes.readFloatBE(9),
        quality: count >= 3 ? bytes.readUInt16BE(13) : null,
      });
    });
    socket.once('error', reject);
  });
}

const close = (actual, expected, tolerance = 0.0005) =>
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const expected = [
  [1024, 800, 'Input A Rated Current'],
  [1027, 51.9, 'Input A Voltage'],
  [1030, 97.5, 'Input A Current'],
  [1033, 5.06025, 'Input A Power'],
  [1039, 800, 'Input B Rated Current'],
  [1042, 52.0, 'Input B Voltage'],
  [1045, 105.0, 'Input B Current'],
  [1048, 5.46, 'Input B Power'],
  [1054, 202.5, 'Total Current'],
  [1057, 51.9, 'Bus A Voltage'],
  [1060, 52.0, 'Bus B Voltage'],
  [1063, 51.95, 'Total Voltage'],
  [1066, 10.52025, 'Total Power'],
  [1072, 1, 'Communication Status LIVE'],
  [1075, 0, 'Controller Alarm State CLEAR'],
  [1078, 0, 'Alarm Severity NONE'],
];

for (const unit of [1, 2, 3]) {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const communication = await read(unit, 1072);
      if (communication.quality === 1 && close(communication.value, 1, 0)) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(ready, true, `Unit ${unit} v1.3 projection did not become LIVE`);

  for (const [offset, value, label] of expected) {
    const point = await read(unit, offset);
    assert.equal(point.quality, 1, `Unit ${unit} ${label} quality is not VALID`);
    assert.ok(
      close(point.value, value),
      `Unit ${unit} ${label} expected ${value}, got ${point.value}`,
    );
  }

  const totalEnergy = await read(unit, 1069);
  assert.equal(totalEnergy.quality, 1, `Unit ${unit} Total Energy quality is not VALID`);
  assert.ok(
    Number.isFinite(totalEnergy.value) && totalEnergy.value >= 0,
    `Unit ${unit} Total Energy must be a non-negative FLOAT32`,
  );
}

console.log(
  'MODBUS_V13_OPERATIONAL_OK: Units 1/2/3 FC04, Config2 A/B ratings/V/I/P, status and total energy',
);
