import net from 'node:net';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { ExtensionState, pinRegistry, registryCsv } from './point-registry.mjs';
import {
  CIRCUITS,
  METRICS,
  REGISTERS_PER_UNIT,
  POINT_LAYOUTS,
  rawPointIndex,
  circuitStartAddress,
  modbusEngineeringValue,
  totalMetricStartAddress,
} from './register-map.mjs';

export {
  CIRCUITS,
  METRICS,
  REGISTERS_PER_UNIT,
  POINT_LAYOUTS,
  rawPointIndex,
} from './register-map.mjs';

const TOTAL_SIGNAL_METRICS = Object.freeze({
  TOTAL_VOLTAGE: Object.freeze({ metricKey: 'voltageV', unit: 'V' }),
  TOTAL_CURRENT: Object.freeze({ metricKey: 'currentA', unit: 'A' }),
  TOTAL_POWER: Object.freeze({ metricKey: 'powerW', unit: 'kW' }),
  TOTAL_ENERGY: Object.freeze({ metricKey: 'energyKwh', unit: 'kWh' }),
});

export function floatRegisters(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value);
  return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)];
}

export class ModbusLatestState {
  constructor(sourceMap, staleMs = 30000, pointLayout = 'blocks-2x48', missingPolicy = 'zero') {
    if (!Number.isInteger(staleMs) || staleMs < 1000) throw new Error('Invalid stale threshold');
    if (!POINT_LAYOUTS.includes(pointLayout)) throw new Error('Invalid MODBUS_POINT_LAYOUT');
    if (!['zero', 'exception'].includes(missingPolicy))
      throw new Error('Invalid MODBUS_MISSING_POLICY');
    this.pointLayout = pointLayout;
    this.missingPolicy = missingPolicy;
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

  recomputeTotalEnergy(unit, now = Date.now()) {
    const slots = this.values.get(unit);
    if (!slots) return false;

    let total = 0;
    let receivedAt = 0;
    for (let circuit = 1; circuit <= CIRCUITS; circuit++) {
      const item = slots.get(circuitStartAddress(circuit) + 6);
      if (!item || now - item.receivedAt > this.staleMs) return false;
      total += item.value;
      receivedAt = Math.max(receivedAt, item.receivedAt);
    }
    if (!Number.isFinite(total) || !Number.isFinite(Math.fround(total))) return false;

    slots.set(totalMetricStartAddress('energyKwh'), { value: total, receivedAt });
    return true;
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

    // Validate the complete incoming sample before changing any Input Register.
    // A finite JS number may still overflow IEEE-754 FLOAT32 during Modbus encoding.
    for (const metric of METRICS) {
      const field = sample.metrics[metric];
      if (!field || !Number.isFinite(field.value)) continue;
      const engineeringValue = modbusEngineeringValue(metric, field.value);
      if (!Number.isFinite(Math.fround(engineeringValue))) return false;
    }

    let changed = false;
    let energyChanged = false;
    const slots = this.values.get(unit);
    for (let i = 0; i < METRICS.length; i++) {
      const metric = METRICS[i];
      const field = sample.metrics[metric];
      if (!field || !Number.isFinite(field.value)) continue;
      const offset = circuitStartAddress(circuit + 1) + i * 2;
      const existing = slots.get(offset);
      if (existing && existing.receivedAt > timestamp) continue;
      slots.set(offset, {
        value: modbusEngineeringValue(metric, field.value),
        receivedAt: timestamp,
      });
      if (metric === 'energyKwh') energyChanged = true;
      changed = true;
    }
    if (energyChanged) this.recomputeTotalEnergy(unit, now);
    return changed;
  }

  applyTotalSignal(unit, logicalPointId, signal) {
    if (!this.values.has(unit) || typeof logicalPointId !== 'string') return false;
    const name = logicalPointId.split('/').at(-1);
    const definition = TOTAL_SIGNAL_METRICS[name];
    if (!definition) return false;

    const slots = this.values.get(unit);
    const address = totalMetricStartAddress(definition.metricKey);
    const timestamp = Date.parse(signal?.observedAt ?? signal?.receivedAt ?? '');

    if (
      signal?.quality !== 'VALID' ||
      signal?.unit !== definition.unit ||
      !Number.isFinite(signal?.value) ||
      !Number.isFinite(timestamp) ||
      !Number.isFinite(Math.fround(signal.value))
    ) {
      slots.delete(address);
      return false;
    }

    slots.set(address, { value: signal.value, receivedAt: timestamp });
    return true;
  }

  read(unit, offset, count, now = Date.now()) {
    if (offset >= 1024 && this.extensions) return this.extensions.read(unit, offset, count, now);
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
    // FC04 is atomic: if one requested register is unavailable, reject the whole
    // block in exception mode. The default 'zero' policy preserves field behavior.
    if (this.missingPolicy === 'exception') {
      for (let addr = offset; addr < offset + count; addr++) {
        const item = slots.get(addr - (addr % 2));
        if (!item || now - item.receivedAt > this.staleMs) return undefined;
      }
    }
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
  if (fn !== 4) return response(transaction, unit, fn | 0x80, Buffer.from([1]));
  if (frame.length !== 12) return response(transaction, unit, fn | 0x80, Buffer.from([3]));
  const offset = frame.readUInt16BE(8),
    count = frame.readUInt16BE(10);
  const registers = state.read(unit, offset, count, now);
  if (registers === null) return response(transaction, unit, fn | 0x80, Buffer.from([2]));
  if (registers === undefined) return response(transaction, unit, fn | 0x80, Buffer.from([4]));
  const body = Buffer.alloc(1 + registers.length * 2);
  body[0] = registers.length * 2;
  registers.forEach((value, index) => body.writeUInt16BE(value, 1 + index * 2));
  return response(transaction, unit, 4, body);
}

export function startBridge({
  sourceMap,
  staleMs = 30000,
  pointLayout = 'blocks-2x48',
  missingPolicy = 'zero',
  modbusHost = '127.0.0.1',
  modbusPort = 1502,
  ingestHost = '127.0.0.1',
  ingestPort = 18082,
  token,
  registry,
  projectionUrl,
  projectionToken,
}) {
  if (!token || token.length < 24) throw new Error('MODBUS_BRIDGE_TOKEN must be set (24+ chars)');
  const state = new ModbusLatestState(sourceMap, staleMs, pointLayout, missingPolicy);
  if (registry) state.extensions = new ExtensionState(registry);
  let stopped = false,
    projectionTimer;
  const projectionAbort = new AbortController();

  async function refreshProjection() {
    try {
      const response = await fetch(projectionUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${projectionToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ signalIds: registry.points.map((point) => point.signalId) }),
        signal: AbortSignal.any([projectionAbort.signal, AbortSignal.timeout(5000)]),
      });
      if (!response.ok) throw new Error('Projection unavailable');
      const body = await response.json();
      if (!Array.isArray(body.signals)) throw new Error('Invalid projection');

      for (const signal of body.signals) {
        state.extensions.apply(signal);
        const point = registry.points.find((candidate) => candidate.signalId === signal.id);
        if (point?.logicalPointId) {
          state.applyTotalSignal(point.unitId, point.logicalPointId, signal);
        }
      }
    } catch {
      if (!stopped) console.warn(JSON.stringify({ event: 'modbus.projection.unavailable' }));
    } finally {
      if (!stopped) projectionTimer = setTimeout(refreshProjection, 2000);
    }
  }

  if (registry && projectionUrl && projectionToken) void refreshProjection();

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
    if (
      request.method === 'GET' &&
      request.url === '/registry.csv' &&
      registry &&
      request.headers.authorization === `Bearer ${token}`
    ) {
      reply.writeHead(200, { 'content-type': 'text/csv', 'cache-control': 'no-store' });
      reply.end(registryCsv(registry));
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
      stopped = true;
      clearTimeout(projectionTimer);
      projectionAbort.abort();
      await Promise.all([new Promise((r) => modbus.close(r)), new Promise((r) => ingest.close(r))]);
    },
  };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const sources = JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON || '{}');
  const registry = process.env.MODBUS_POINTS_FILE
    ? pinRegistry(
        JSON.parse(readFileSync(process.env.MODBUS_POINTS_FILE, 'utf8')),
        process.env.MODBUS_REGISTRY_PATH || '/data/modbus-registry.json',
      )
    : undefined;
  startBridge({
    registry,
    projectionUrl: process.env.INDUSTRIAL_PROJECTION_URL,
    projectionToken: process.env.INDUSTRIAL_PROJECTION_TOKEN,
    sourceMap: sources,
    staleMs: Number(process.env.MODBUS_STALE_MS || 30000),
    pointLayout: process.env.MODBUS_POINT_LAYOUT || 'blocks-2x48',
    missingPolicy: process.env.MODBUS_MISSING_POLICY || 'zero',
    modbusHost: process.env.MODBUS_BIND_HOST || '127.0.0.1',
    modbusPort: Number(process.env.MODBUS_BIND_PORT || 1502),
    ingestHost: process.env.MODBUS_INGEST_HOST || '127.0.0.1',
    ingestPort: Number(process.env.MODBUS_INGEST_PORT || 18082),
    token: process.env.MODBUS_BRIDGE_TOKEN,
  });
}
