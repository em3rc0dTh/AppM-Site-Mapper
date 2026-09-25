import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { loadEnvFile } from 'node:process';

import { buildSyntheticCycle, nextMessageId } from './generator.mjs';

const ENV_FILE = '.env.telemetry-simulator';

try {
  loadEnvFile(ENV_FILE);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required simulator configuration: ${name}`);
  }
  return value;
}

function positiveInt(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const output = Buffer.allocUnsafe(bytes.length + 2);
  output.writeUInt16BE(bytes.length, 0);
  bytes.copy(output, 2);
  return output;
}

function encodeRemainingLength(length) {
  const bytes = [];
  let value = length;

  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    bytes.push(byte);
  } while (value > 0);

  return Buffer.from(bytes);
}

function mqttFrame(header, body) {
  return Buffer.concat([Buffer.from([header]), encodeRemainingLength(body.length), body]);
}

function encodeConnect({ clientId, username, password, keepAliveSeconds = 30 }) {
  let flags = 0x02;
  if (username !== undefined) flags |= 0x80;
  if (password !== undefined) flags |= 0x40;

  const variableHeader = Buffer.concat([
    encodeString('MQTT'),
    Buffer.from([0x04, flags, (keepAliveSeconds >> 8) & 0xff, keepAliveSeconds & 0xff]),
  ]);

  const payload = Buffer.concat([
    encodeString(clientId),
    ...(username === undefined ? [] : [encodeString(username)]),
    ...(password === undefined ? [] : [encodeString(password)]),
  ]);

  return mqttFrame(0x10, Buffer.concat([variableHeader, payload]));
}

function encodePublish(topic, payload, packetId) {
  const body = Buffer.concat([
    encodeString(topic),
    Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]),
    Buffer.from(payload),
  ]);

  return mqttFrame(0x32, body);
}

function decodePackets(buffer) {
  const packets = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;

    const first = buffer[offset];
    let multiplier = 1;
    let remainingLength = 0;
    let cursor = offset + 1;
    let encodedBytes = 0;

    while (true) {
      const byte = buffer[cursor];
      if (byte === undefined) {
        return { packets, remainder: buffer.subarray(offset) };
      }

      remainingLength += (byte & 0x7f) * multiplier;
      multiplier *= 128;
      cursor += 1;
      encodedBytes += 1;

      if ((byte & 0x80) === 0) break;
      if (encodedBytes >= 4) throw new Error('Malformed MQTT remaining length.');
    }

    const end = cursor + remainingLength;
    if (end > buffer.length) break;

    packets.push({
      type: first >> 4,
      body: buffer.subarray(cursor, end),
    });
    offset = end;
  }

  return { packets, remainder: buffer.subarray(offset) };
}

class MqttPublisher {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.packetId = 1;
    this.connected = false;
    this.waiters = new Map();
  }

  async connect() {
    const url = new URL(this.options.brokerUrl);
    if (url.protocol !== 'mqtt:' && url.protocol !== 'mqtts:') {
      throw new Error('SIM_MQTT_BROKER_URL must use mqtt:// or mqtts://.');
    }

    const secure = url.protocol === 'mqtts:';
    const port = Number(url.port || (secure ? 8883 : 1883));
    const common = { host: url.hostname, port };

    const socket = secure
      ? tls.connect({
          ...common,
          servername: url.hostname,
          rejectUnauthorized: this.options.rejectUnauthorized,
          ...(this.options.ca === undefined ? {} : { ca: this.options.ca }),
        })
      : net.connect(common);

    this.socket = socket;

    await new Promise((resolve, reject) => {
      const event = secure ? 'secureConnect' : 'connect';
      socket.once(event, resolve);
      socket.once('error', reject);
    });

    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (error) => {
      if (this.connected) {
        console.error(`[sim] MQTT socket error: ${error.message}`);
      }
    });
    socket.on('close', () => {
      this.connected = false;
    });

    socket.write(
      encodeConnect({
        clientId: this.options.clientId,
        username: this.options.username,
        password: this.options.password,
      }),
    );

    await this.waitFor('connack', 5_000);
    this.connected = true;
  }

  async publish(topic, object) {
    if (!this.socket || !this.connected) {
      throw new Error('MQTT publisher is not connected.');
    }

    const packetId = this.nextPacketId();
    const payload = Buffer.from(JSON.stringify(object), 'utf8');
    this.socket.write(encodePublish(topic, payload, packetId));
    await this.waitFor(`puback:${packetId}`, 5_000);
  }

  close() {
    this.connected = false;
    this.socket?.end();
    this.socket = null;

    for (const waiter of this.waiters.values()) {
      waiter.reject(new Error('MQTT publisher closed.'));
      clearTimeout(waiter.timer);
    }
    this.waiters.clear();
  }

  onData(chunk) {
    const parsed = decodePackets(Buffer.concat([this.buffer, chunk]));
    this.buffer = Buffer.from(parsed.remainder);

    for (const packet of parsed.packets) {
      if (packet.type === 2) {
        const returnCode = packet.body[1];
        if (returnCode !== 0) {
          this.resolveWaiter('connack', new Error(`MQTT connection rejected: ${returnCode}`));
          continue;
        }

        this.resolveWaiter('connack');
      }

      if (packet.type === 4 && packet.body.length >= 2) {
        const packetId = ((packet.body[0] ?? 0) << 8) | (packet.body[1] ?? 0);
        this.resolveWaiter(`puback:${packetId}`);
      }
    }
  }

  waitFor(key, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(key);
        reject(new Error(`Timed out waiting for MQTT ${key}.`));
      }, timeoutMs);

      this.waiters.set(key, { resolve, reject, timer });
    });
  }

  resolveWaiter(key, error) {
    const waiter = this.waiters.get(key);
    if (!waiter) return;

    clearTimeout(waiter.timer);
    this.waiters.delete(key);

    if (error) waiter.reject(error);
    else waiter.resolve();
  }

  nextPacketId() {
    const current = this.packetId;
    this.packetId = this.packetId >= 65_535 ? 1 : this.packetId + 1;
    return current;
  }
}

function topicFor(mode, serialNumber, topicSource) {
  if (mode === 'legacy') {
    return `data/dev/${serialNumber}`;
  }

  if (mode === 'appmanager') {
    const prefix = process.env.SIM_TOPIC_PREFIX?.trim() || 'appmanager/v1/raw/';
    const suffix = process.env.SIM_TOPIC_SUFFIX?.trim() || '/telemetry';
    return `${prefix}${topicSource}${suffix}`;
  }

  throw new Error('SIM_TOPIC_MODE must be "appmanager" or "legacy".');
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const brokerUrl = required('SIM_MQTT_BROKER_URL');
  const serialNumber = required('SIM_SERIAL_NUMBER');
  const topicSource = process.env.SIM_TOPIC_SOURCE?.trim() || serialNumber;
  const topicMode = process.env.SIM_TOPIC_MODE?.trim() || 'appmanager';
  const intervalMs = positiveInt('SIM_INTERVAL_MS', 10_000);
  const fragmentDelayMs = positiveInt('SIM_FRAGMENT_DELAY_MS', 150);
  const seed = positiveInt('SIM_SEED', 251107);
  const maxCycles = positiveInt('SIM_CYCLES', Number.MAX_SAFE_INTEGER);
  const startingMessageId = positiveInt('SIM_START_MSGID', 597);
  const topic = topicFor(topicMode, serialNumber, topicSource);
  const caFile = process.env.SIM_MQTT_CA_FILE?.trim();
  const ca = caFile ? fs.readFileSync(path.resolve(caFile)) : undefined;

  const publisher = new MqttPublisher({
    brokerUrl,
    clientId:
      process.env.SIM_MQTT_CLIENT_ID?.trim() ||
      `appmanager-synthetic-${serialNumber}-${process.pid}`,
    username: process.env.SIM_MQTT_USERNAME?.trim() || undefined,
    password: process.env.SIM_MQTT_PASSWORD || undefined,
    rejectUnauthorized: process.env.SIM_MQTT_INSECURE_TLS !== 'true',
    ca,
  });

  let stopping = false;
  const stop = () => {
    stopping = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log('[sim] AppManager synthetic telemetry provider');
  console.log(`[sim] broker=${brokerUrl}`);
  console.log(`[sim] mode=${topicMode}`);
  console.log(`[sim] topic=${topic}`);
  console.log(`[sim] sn=${serialNumber}`);
  console.log(`[sim] intervalMs=${intervalMs}`);

  await publisher.connect();
  console.log('[sim] MQTT connected');

  let messageId = startingMessageId;

  try {
    for (let cycle = 0; cycle < maxCycles && !stopping; cycle += 1) {
      const epochSeconds = Math.floor(Date.now() / 1000);
      const frames = buildSyntheticCycle({
        serialNumber,
        cycle,
        firstMessageId: messageId,
        epochSeconds,
        seed,
      });

      for (const frame of frames) {
        if (stopping) break;

        await publisher.publish(topic, frame);
        console.log(
          `[sim] published msgid=${frame.msgid} breakers=${Object.keys(frame.reported).join(',')}`,
        );
        await sleep(fragmentDelayMs);
      }

      messageId = nextMessageId(frames, messageId + frames.length);

      if (!stopping && cycle + 1 < maxCycles) {
        const elapsed = fragmentDelayMs * frames.length;
        await sleep(Math.max(0, intervalMs - elapsed));
      }
    }
  } finally {
    publisher.close();
  }

  console.log('[sim] stopped');
}

main().catch((error) => {
  console.error(`[sim] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
