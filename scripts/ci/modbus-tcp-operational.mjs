import assert from 'node:assert/strict';
import net from 'node:net';

function command(unit, offset, count) {
  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(101, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame[6] = unit;
  frame[7] = 3;
  frame.writeUInt16BE(offset, 8);
  frame.writeUInt16BE(count, 10);
  return frame;
}

async function read(unit, offset, count) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(process.env.MODBUS_TEST_PORT || 1502) }, () =>
      socket.write(command(unit, offset, count)),
    );
    socket.setTimeout(2000, () => socket.destroy(new Error('Modbus read timed out')));
    socket.once('data', (chunk) => {
      socket.destroy();
      if (chunk.readUInt16BE(0) !== 101 || chunk[6] !== unit || chunk[7] !== 3) {
        reject(new Error('Unexpected Modbus MBAP/FC03 response'));
      } else {
        resolve(chunk);
      }
    });
    socket.once('error', reject);
  });
}

let voltage;
for (let attempt = 0; attempt < 35; attempt++) {
  const registers = await read(1, 0, 8);
  voltage = registers.readFloatBE(9);
  if (Math.abs(voltage - 13.79) < 0.001) {
    assert.ok(Math.abs(registers.readFloatBE(13) - 9.91) < 0.001);
    assert.ok(Math.abs(registers.readFloatBE(17) - 136.72) < 0.001);
    assert.ok(Math.abs(registers.readFloatBE(21) - 0.4155) < 0.0001);
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(Math.abs(voltage - 13.79) < 0.001, 'MQTT reading not exported to Modbus TCP');
const other = await read(2, 0, 8);
assert.equal(other.readFloatBE(9), 0, 'Second BFDB Unit ID leaked first BFDB voltage');
console.log(
  '[PASS] MQTT -> Site Mapper accepted breaker -> Modbus FC03 TCP FLOAT32, 4 metrics, isolated Unit IDs',
);
