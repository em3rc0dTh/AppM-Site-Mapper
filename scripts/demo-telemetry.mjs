import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = path.join(ROOT, 'infra', 'demo', 'docker-compose.telemetry.yml');
const COMPOSE_PROJECT = 'appm-telemetry-demo';
const DATABASE_NAME = 'appm_site_mapper_demo';
const MONGO_URI = 'mongodb://127.0.0.1:27017';
const MQTT_URL = 'mqtt://127.0.0.1:1883';
const SERIAL_NUMBER = 'DEMO25110703400009';
const TOPIC_SOURCE = 'demo-qdf-01';
const ENTITY_ID = 'demo-equipment-qdf-01';
const APP_PORT = Number(process.env.DEMO_PORT ?? '3000');

const children = new Set();
let shuttingDown = false;

function commandName(base) {
  return process.platform === 'win32' && base === 'npm' ? 'npm.cmd' : base;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: options.stdio ?? 'inherit',
      env: options.env ?? process.env,
      shell: false,
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function spawnPrefixed(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  children.add(child);

  const attach = (stream, error = false) => {
    const reader = createInterface({ input: stream });
    reader.on('line', (line) => {
      const output = `[${label}] ${line}\n`;
      (error ? process.stderr : process.stdout).write(output);
    });
  };

  attach(child.stdout);
  attach(child.stderr, true);

  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0) {
      console.error(`[demo] ${label} stopped unexpectedly (code=${code}, signal=${signal ?? 'none'}).`);
      void shutdown(1);
    }
  });

  return child;
}

async function ensureDependencies() {
  if (existsSync(path.join(ROOT, 'node_modules', 'mongodb', 'package.json'))) return;

  console.log('[demo] node_modules missing; running npm ci...');
  await run(commandName('npm'), ['ci', '--no-audit', '--no-fund']);
}

async function ensureDocker() {
  await run(commandName('docker'), ['compose', 'version'], { stdio: 'ignore' }).catch(() => {
    throw new Error('Docker with Docker Compose is required and must be running.');
  });
}

async function waitForPort(host, port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const connected = await new Promise((resolve) => {
      const socket = net.connect({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.setTimeout(1_000, () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (connected) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${host}:${port}.`);
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status > 0) return;
    } catch {
      // App is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

function topologyDocuments(now) {
  const base = (id, parentId, name, kind) => ({
    id,
    parentId,
    name,
    kind,
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  return [
    { ...base('demo-network', null, 'Synthetic Demo Network', 'NETWORK') },
    { ...base('demo-site', 'demo-network', 'Synthetic Demo Site', 'SITE') },
    { ...base('demo-structure', 'demo-site', 'Synthetic Demo Structure', 'STRUCTURE') },
    { ...base('demo-level', 'demo-structure', 'Synthetic Demo Level', 'LEVEL') },
    {
      ...base('demo-room', 'demo-level', 'Synthetic Demo Room', 'ROOM_SUBSTRUCTURE'),
      variant: 'ROOM',
    },
    {
      ...base('demo-bay', 'demo-room', 'Synthetic Demo Bay', 'CONTAINER_CLUSTER_BAY'),
      variant: 'BAY',
    },
    {
      ...base('demo-position', 'demo-bay', 'A1', 'POSITION'),
      coordinate: { row: 'A', column: 1 },
    },
    {
      ...base('demo-rack', 'demo-position', 'Synthetic Demo Rack', 'CONTAINER_RACK'),
      variant: 'RACK',
      totalU: 42,
      cas: [{ id: 'demo-cas-available', startU: 1, endU: 42, state: 'AVAILABLE' }],
    },
    {
      ...base(ENTITY_ID, 'demo-rack', 'Synthetic QDF / BDFB', 'EQUIPMENT'),
      serialNumber: SERIAL_NUMBER,
      category: 'QDF/BDFB DEMO',
      equipmentType: 'QDF_BDFB',
      pinned: true,
    },
  ];
}

async function seedDemoDatabase() {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5_000 });
  await client.connect();

  try {
    const db = client.db(DATABASE_NAME);
    await db.dropDatabase();

    const now = new Date().toISOString();
    await db.collection('topology_nodes').insertMany(topologyDocuments(now));
    await db.collection('telemetry_sources').insertOne({
      id: 'sim-demo-qdf-01',
      entityId: ENTITY_ID,
      entityKind: 'EQUIPMENT',
      topicSource: TOPIC_SOURCE,
      expectedSerialNumber: SERIAL_NUMBER,
      protocolProfile: 'myems-appm-breaker-v1',
      rawSchemaVersion: 'legacy-appm-v1',
      staleAfterSeconds: 30,
      enabled: true,
      simulated: true,
    });

    console.log(`[demo] Seeded isolated Mongo database: ${DATABASE_NAME}`);
  } finally {
    await client.close();
  }
}

async function bootstrapAdmin(baseUrl, token, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/bootstrap`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      displayName: 'Synthetic Demo Admin',
    }),
  });

  if (response.status !== 201) {
    const body = await response.text();
    throw new Error(`Demo admin bootstrap failed (${response.status}): ${body}`);
  }
}

async function openBrowser(url) {
  if (process.env.DEMO_NO_BROWSER === 'true') return;

  const opener =
    process.platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { command: 'open', args: [url] }
        : { command: 'xdg-open', args: [url] };

  const child = spawn(opener.command, opener.args, {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
    shell: false,
  });
  child.unref();
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('\n[demo] Shutting down synthetic telemetry demo...');

  for (const child of children) {
    child.kill('SIGTERM');
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const child of children) {
    if (!child.killed) child.kill('SIGKILL');
  }

  await run(
    commandName('docker'),
    ['compose', '-p', COMPOSE_PROJECT, '-f', COMPOSE_FILE, 'down', '--remove-orphans'],
    { stdio: 'ignore' },
  ).catch(() => undefined);

  process.exitCode = exitCode;
}

async function main() {
  if (!Number.isInteger(APP_PORT) || APP_PORT < 1 || APP_PORT > 65_535) {
    throw new Error('DEMO_PORT must be a valid TCP port.');
  }

  await ensureDependencies();
  await ensureDocker();

  console.log('[demo] Starting MongoDB + demo MQTT broker...');
  await run(commandName('docker'), [
    'compose',
    '-p',
    COMPOSE_PROJECT,
    '-f',
    COMPOSE_FILE,
    'up',
    '-d',
    '--remove-orphans',
  ]);

  await Promise.all([waitForPort('127.0.0.1', 27017), waitForPort('127.0.0.1', 1883)]);
  await seedDemoDatabase();

  const bootstrapToken = randomBytes(32).toString('hex');
  const adminPassword = `Demo-${randomBytes(10).toString('base64url')}!9`;
  const adminEmail = 'demo@appmanager.local';
  const baseUrl = `http://127.0.0.1:${APP_PORT}`;

  const appEnv = {
    ...process.env,
    APP_ENV: 'development',
    APP_PERSISTENCE: 'mongodb',
    MONGODB_URI: MONGO_URI,
    MONGODB_DB_NAME: DATABASE_NAME,
    BOOTSTRAP_ADMIN_TOKEN: bootstrapToken,
    TELEMETRY_ENABLED: 'true',
    TELEMETRY_MAX_STREAMS: '100',
    TELEMETRY_MAX_PAYLOAD_BYTES: '262144',
    TELEMETRY_MAX_REPORTED_ENTRIES: '512',
    TELEMETRY_QUARANTINE_RETENTION_DAYS: '14',
    MQTT_BROKER_URL: MQTT_URL,
    MQTT_CLIENT_ID: 'appmanager-site-mapper-demo',
    MQTT_TOPIC_PREFIX: 'appmanager/v1/raw/',
    MQTT_TOPIC_SUFFIX: '/telemetry',
    MQTT_TOPIC_FILTER: 'appmanager/v1/raw/+/telemetry',
  };

  console.log('[demo] Starting AppManager Site Mapper...');
  spawnPrefixed('app', commandName('npm'), ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(APP_PORT)], appEnv);
  await waitForHttp(`${baseUrl}/login`);
  await bootstrapAdmin(baseUrl, bootstrapToken, adminEmail, adminPassword);

  const simulatorEnv = {
    ...appEnv,
    SIM_MQTT_BROKER_URL: MQTT_URL,
    SIM_TOPIC_MODE: 'appmanager',
    SIM_TOPIC_SOURCE: TOPIC_SOURCE,
    SIM_SERIAL_NUMBER: SERIAL_NUMBER,
    SIM_ENTITY_ID: ENTITY_ID,
    SIM_ENTITY_KIND: 'EQUIPMENT',
    SIM_INTERVAL_MS: process.env.SIM_INTERVAL_MS ?? '3000',
    SIM_FRAGMENT_DELAY_MS: process.env.SIM_FRAGMENT_DELAY_MS ?? '150',
    SIM_START_MSGID: '597',
    SIM_SEED: process.env.SIM_SEED ?? '251107',
    SIM_CYCLES: process.env.SIM_CYCLES ?? '1000000',
  };

  console.log('[demo] Starting synthetic hardware publisher...');
  spawnPrefixed('sim', commandName('npm'), ['run', 'telemetry:sim'], simulatorEnv);

  const telemetryUrl = `${baseUrl}/telemetry`;
  console.log('');
  console.log('============================================================');
  console.log(' AppManager Site Mapper — Synthetic Telemetry Demo');
  console.log('============================================================');
  console.log(` URL:      ${telemetryUrl}`);
  console.log(` Email:    ${adminEmail}`);
  console.log(` Password: ${adminPassword}`);
  console.log(` Device:   ${SERIAL_NUMBER}`);
  console.log(` Source:   ${TOPIC_SOURCE}`);
  console.log(' Data:     SYNTHETIC / SIMULATED');
  console.log('');
  console.log(' Sign in once in the opened browser, then visit /telemetry.');
  console.log(' Press Ctrl+C here to stop the complete demo stack.');
  console.log('============================================================');
  console.log('');

  await openBrowser(`${baseUrl}/login`);

  await new Promise(() => undefined);
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

main().catch(async (error) => {
  console.error(`[demo] fatal: ${error instanceof Error ? error.message : String(error)}`);
  await shutdown(1);
});
