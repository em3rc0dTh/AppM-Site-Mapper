import net from 'node:net';
import http from 'node:http';

export const CIRCUITS = 96;
export const METRICS = ['voltageV', 'currentA', 'powerW', 'energyKwh'];
export const REGISTERS_PER_UNIT = CIRCUITS * METRICS.length * 2;

export const POINT_LAYOUTS = ['blocks-2x48', 'panels-4x24'];

export function rawPointIndex(rawPointId, pointLayout = 'blocks-2x48') {
  if (pointLayout === 'panels-4x24') {
    const match = /^0_([1-4])_([1-9]|1[0-9]|2[0-4])$/.exec(rawPointId);
    return match ? (Number(match[1]) - 1) * 24 + Number(match[2]) - 1 : null;
  }
  if (pointLayout === 'blocks-2x48') {
    const match = /^0_([12])_([1-9]|[1-3][0-9]|4[0-8])$/.exec(rawPointId);
    return match ? (Number(match[1]) - 1) * 48 + Number(match[2]) - 1 : null;
  }
  throw new Error('MODBUS_POINT_LAYOUT must be blocks-2x48 or panels-4x24');
}

export function floatRegisters(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value);
  return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)];
}

export class ModbusLatestState {
  constructor(sourceMap, staleMs = 30000, pointLayout = 'blocks-2x48') {
    if (!Number.isInteger(staleMs) || staleMs < 1000) throw new Error('Invalid stale threshold');
    if (!POINT_LAYOUTS.includes(pointLayout)) throw new Error('Invalid MODBUS_POINT_LAYOUT');
    this.pointLayout = pointLayout;
    const identities = Object.entries(sourceMap);
    if (identities.length < 1 || identities.length > 247)
      throw new Error('Configure Modbus source identities');
    this.sourceUnits = new Map();
    this.values = new Map();
    this.staleMs = staleMs;
    for (const [source, unit] of identities) {
      if (!source || !Number.isInteger(unit) || unit < 1 || unit > 247 || this.values.has(unit))
        throw new Error('Modbus source map must have distinct serials and unit IDs 1..247');
      this.sourceUnits.set(source, unit);
      this.values.set(unit, new Map());
    }
  }

  apply(sample, now = Date.now()) {
    if (!sample || typeof sample !== 'object') return false;
    const unit = this.sourceUnits.get(sample.sourceIdentity);
    if (!unit) return false;
    const circuit = rawPointIndex(sample.rawPointId, this.pointLayout);
    if (circuit === null) return false;
    if (!sample.metrics || typeof sample.metrics !== 'object') return false;
    const timestamp = Date.parse(sample.receivedAt);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 60000) return false;
    let changed = false;
    const slots = this.values.get(unit);
    for (let i = 0; i < METRICS.length; i++) {
      const field = sample.metrics[METRICS[i]];
      if (!field || !Number.isFinite(field.value)) continue;
      const offset = circuit * 8 + i * 2;
      const existing = slots.get(offset);
      if (existing && existing.receivedAt > timestamp) continue;
      slots.set(offset, { value: field.value, receivedAt: timestamp });
      changed = true;
    }
    return changed;
  }

  read(unit, offset, count, now = Date.now()) {
    if (!this.values.has(unit)) return null;
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 125 ||
      offset < 0 ||
      offset + count > REGISTERS_PER_UNIT
    )
      return null;
    const slots = this.values.get(unit);
    return Array.from({ length: count }, (_, index) => {
      const addr = offset + index;
      const item = slots.get(addr - (addr % 2));
      if (!item || now - item.receivedAt > this.staleMs) return 0;
      return floatRegisters(item.value)[addr % 2];
    });
  }
}

function response(transaction, unit, fn, body) {
  const frame = Buffer.alloc(8 + body.length);
  frame.writeUInt16BE(transaction, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(2 + body.length, 4);
  frame[6] = unit;
  frame[7] = fn;
  body.copy(frame, 8);
  return frame;
}

export function handleFrame(frame, state, now = Date.now()) {
  if (frame.length < 8 || frame.readUInt16BE(2) !== 0) return null;
  const transaction = frame.readUInt16BE(0);
  const unit = frame[6];
  const fn = frame[7];
  if (fn !== 3) return response(transaction, unit, fn | 0x80, Buffer.from([1]));
  if (frame.length !== 12) return response(transaction, unit, fn | 0x80, Buffer.from([3]));
  const offset = frame.readUInt16BE(8),
    count = frame.readUInt16BE(10);
  const registers = state.read(unit, offset, count, now);
  if (!registers) return response(transaction, unit, fn | 0x80, Buffer.from([2]));
  const body = Buffer.alloc(1 + registers.length * 2);
  body[0] = registers.length * 2;
  registers.forEach((value, index) => body.writeUInt16BE(value, 1 + index * 2));
  return response(transaction, unit, 3, body);
}

export function startBridge({
  sourceMap,
  staleMs = 30000,
  pointLayout = 'blocks-2x48',
  modbusHost = '127.0.0.1',
  modbusPort = 1502,
  ingestHost = '127.0.0.1',
  ingestPort = 18082,
  token,
}) {
  if (!token || token.length < 24) throw new Error('MODBUS_BRIDGE_TOKEN must be set (24+ chars)');
  const state = new ModbusLatestState(sourceMap, staleMs, pointLayout);
  const modbus = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > 65536) {
        socket.destroy();
        return;
      }
      while (pending.length >= 7) {
        const length = pending.readUInt16BE(4);
        if (length < 2 || length > 254) {
          socket.destroy();
          return;
        }
        const total = 6 + length;
        if (pending.length < total) break;
        const frame = pending.subarray(0, total);
        pending = pending.subarray(total);
        const reply = handleFrame(frame, state);
        if (reply) socket.write(reply);
      }
    });
    socket.on('error', () => {});
    socket.setTimeout(30000, () => socket.destroy());
  });

  const ingest = http.createServer(async (request, reply) => {
    const finish = (status, message) => {
      reply.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      reply.end(JSON.stringify({ status: message }));
    };
    if (request.method === 'GET' && request.url === '/health') {
      finish(200, 'ok');
      return;
    }
    if (request.method !== 'POST' || request.url !== '/internal/accepted-breaker') {
      finish(404, 'not_found');
      return;
    }
    // Never use this service as a public ingress; token and loopback binding both required.
    if (request.headers.authorization !== `Bearer ${token}`) {
      finish(401, 'unauthorized');
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65536) {
        finish(413, 'too_large');
        return;
      }
      chunks.push(chunk);
    }
    try {
      const sample = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      finish(state.apply(sample) ? 202 : 422, 'processed');
    } catch {
      finish(400, 'invalid_json');
    }
  });

  modbus.listen(modbusPort, modbusHost);
  ingest.listen(ingestPort, ingestHost);
  return {
    state,
    modbus,
    ingest,
    close: async () => {
      await Promise.all([new Promise((r) => modbus.close(r)), new Promise((r) => ingest.close(r))]);
    },
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const sources = JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON || '{}');
  startBridge({
    sourceMap: sources,
    staleMs: Number(process.env.MODBUS_STALE_MS || 30000),
    pointLayout: process.env.MODBUS_POINT_LAYOUT || 'blocks-2x48',
    modbusHost: process.env.MODBUS_BIND_HOST || '127.0.0.1',
    modbusPort: Number(process.env.MODBUS_BIND_PORT || 1502),
    ingestHost: process.env.MODBUS_INGEST_HOST || '127.0.0.1',
    ingestPort: Number(process.env.MODBUS_INGEST_PORT || 18082),
    token: process.env.MODBUS_BRIDGE_TOKEN,
  });
}
