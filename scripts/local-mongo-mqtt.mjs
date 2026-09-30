import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const args = new Set(process.argv.slice(2));
const inspectOnly = args.has('--inspect');
const initAdmin = args.has('--init-admin');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const uri = process.env.MONGODB_URI?.trim();
const databaseName = process.env.MONGODB_DB_NAME?.trim() || 'appm_site_mapper';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '3000');
const baseUrl = 'http://' + host + ':' + port;
const serials = [
  ...new Set(
    (process.env.MQTT_EXPECTED_SOURCES || 'EMU-BFDB-01,EMU-BFDB-02,EMU-BFDB-03')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

if (!uri) throw new Error('Missing MONGODB_URI. Set it in ignored .env.local.');

function parseMap() {
  const raw = process.env.MQTT_SOURCE_DEVICE_MAP?.trim() || '{}';
  const value = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.values(value).some((v) => typeof v !== 'string' || !v.trim())
  ) {
    throw new Error(
      'MQTT_SOURCE_DEVICE_MAP must be a JSON object mapping source serials to device IDs.',
    );
  }
  return value;
}

function rawIds(device) {
  const ids = [];
  for (const shelf of device.bdfb?.shelves || []) {
    for (const frame of shelf.frames || []) {
      for (const panel of frame.panels || []) {
        for (const endpoint of panel.endpoints || []) {
          if (endpoint.variant === 'BREAKER' && endpoint.telemetry?.rawPointId) {
            ids.push(endpoint.telemetry.rawPointId);
          }
        }
      }
    }
  }
  return ids;
}

function expectedPoints() {
  return Array.from({ length: 4 }, (_, panel) =>
    Array.from({ length: 24 }, (_, slot) => '0_' + (panel + 1) + '_' + (slot + 1)),
  ).flat();
}

async function inspectMongo() {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 2,
  });
  try {
    await client.connect();
    const db = client.db(databaseName);
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (item) => item.name,
    );
    const count = names.includes('topology_nodes')
      ? await db.collection('topology_nodes').countDocuments({})
      : 0;

    if (count === 0) {
      const possibleLegacy = names.filter((name) =>
        /network|site|structure|substructure|cluster|container|device|rack|room/i.test(name),
      );
      throw new Error(
        'Selected MongoDB has no canonical MK1 topology_nodes. No data was created or changed.\n' +
          'Database: ' +
          databaseName +
          '\n' +
          'Possible legacy collections: ' +
          (possibleLegacy.join(', ') || 'none detected') +
          '\n' +
          'Check MONGODB_DB_NAME. If this is the legacy schema, follow ' +
          'docs/migrations/legacy-to-mk1.md (dry-run, staging, backup and approved promotion).',
      );
    }

    const roots = await db
      .collection('topology_nodes')
      .countDocuments({ kind: 'NETWORK', parentId: null, lifecycle: 'ACTIVE' });
    if (roots === 0) {
      throw new Error(
        'topology_nodes contains ' +
          count +
          ' documents but no active root Network. ' +
          'Refusing to claim the source is a valid MK1 inventory.',
      );
    }

    const users = names.includes('users') ? await db.collection('users').countDocuments({}) : 0;
    const paths = names.includes('power_paths')
      ? await db.collection('power_paths').countDocuments({ lifecycle: 'ACTIVE' })
      : 0;
    const inventory = await db
      .collection('topology_nodes')
      .find({
        kind: { $in: ['DEVICE', 'EQUIPMENT'] },
        lifecycle: 'ACTIVE',
      })
      .project({
        _id: 0,
        id: 1,
        kind: 1,
        serialNumber: 1,
        bdfb: 1,
      })
      .toArray();

    const map = parseMap();
    const mappedIds = new Set();
    const matched = [];
    const required = new Set(expectedPoints());
    let complete = true;

    for (const serial of serials) {
      const mappedId = map[serial];
      const candidates = mappedId
        ? inventory.filter((item) => item.id === mappedId)
        : inventory.filter((item) => item.serialNumber === serial);
      if (candidates.length !== 1) {
        complete = false;
        console.log(
          'SOURCE ' +
            serial +
            ': ' +
            (candidates.length > 1 ? 'AMBIGUOUS' : 'UNMAPPED') +
            ' — use an evidenced MQTT_SOURCE_DEVICE_MAP only if source serial differs.',
        );
        continue;
      }

      const device = candidates[0];
      if (mappedIds.has(device.id)) {
        throw new Error(
          'Multiple expected MQTT serials map to one Mongo device; refusing ambiguous binding.',
        );
      }
      mappedIds.add(device.id);

      const ids = rawIds(device);
      const explicit = new Set(ids);
      const duplicates = ids.length !== explicit.size;
      const matching = [...required].filter((point) => explicit.has(point)).length;
      const valid = Boolean(device.bdfb) && matching === 96 && !duplicates;

      if (!valid) complete = false;
      console.log(
        'SOURCE ' +
          serial +
          ': matched existing ' +
          device.kind +
          ' (ID ' +
          device.id +
          '), explicitly bound=' +
          matching +
          '/96, duplicate bindings=' +
          duplicates +
          (valid ? ' READY' : ' NEEDS MAPPING REVIEW'),
      );
      matched.push({ serial, id: device.id, bound: matching, valid });
    }

    console.log('');
    console.log('READ-ONLY MONGODB PREFLIGHT');
    console.log('Database: ' + databaseName);
    console.log('Canonical nodes: ' + count);
    console.log('Active root Networks: ' + roots);
    console.log('Active power paths: ' + paths);
    console.log('Existing users: ' + users);
    console.log(
      'MQTT binding: ' +
        (complete && matched.length === serials.length
          ? '3-source explicit mapping ready'
          : 'INCOMPLETE — do not assume all breaker values are mapped'),
    );
    console.log('No MongoDB records have been created, seeded, migrated or modified.');
    console.log('');

    if (args.has('--strict') && !complete) {
      throw new Error(
        'Strict MQTT binding check failed. Inspect existing serials and approved raw-point bindings.',
      );
    }

    if (!inspectOnly && !initAdmin && users === 0) {
      throw new Error(
        'MongoDB contains no application users. No administrator was created automatically. ' +
          'If authorized, rerun with --init-admin to create only the first application user.',
      );
    }
    if (initAdmin && users > 0) {
      throw new Error(
        'MongoDB already has users. Sign in with an existing account; --init-admin is first-user only.',
      );
    }
    return { count, roots, users, complete };
  } finally {
    await client.close();
  }
}

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const bootstrapToken = initAdmin ? randomBytes(24).toString('base64url') : undefined;
const initialPassword = initAdmin
  ? process.env.LOCAL_ADMIN_PASSWORD || 'Local-' + randomBytes(16).toString('base64url') + '!Aa1'
  : undefined;
const initialEmail = process.env.LOCAL_ADMIN_EMAIL || 'admin@local.test';
const childEnv = {
  ...process.env,
  APP_ENV: 'development',
  APP_PERSISTENCE: 'mongodb',
  TELEMETRY_ENABLED: 'true',
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883',
  MQTT_TOPIC_PREFIX: process.env.MQTT_TOPIC_PREFIX || 'data/dev/',
  MQTT_TOPIC_FILTER: process.env.MQTT_TOPIC_FILTER || 'data/dev/#',
  BFDB_TELEMETRY_BINDING_MODE: process.env.BFDB_TELEMETRY_BINDING_MODE || 'explicit',
  BFDB_POSITIONS_PER_PANEL: process.env.BFDB_POSITIONS_PER_PANEL || '24',
  MQTT_EXPECTED_SOURCES: serials.join(','),
  ...(bootstrapToken ? { BOOTSTRAP_ADMIN_TOKEN: bootstrapToken } : {}),
};

let child;
let exited = false;
async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    if (exited) throw new Error('Next.js exited before becoming ready.');
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch {
      // Next is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('Site Mapper did not start within 90 seconds.');
}

async function bootstrapUser() {
  if (!bootstrapToken || !initialPassword) return;
  const response = await fetch(baseUrl + '/api/auth/bootstrap', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + bootstrapToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: initialEmail,
      password: initialPassword,
      displayName: process.env.LOCAL_ADMIN_NAME || 'Local Administrator',
    }),
  });
  if (!response.ok) {
    throw new Error('First-user bootstrap failed (HTTP ' + response.status + ').');
  }
  console.log('First application administrator created (explicit --init-admin request).');
  console.log('Email: ' + initialEmail);
  console.log('Temporary password: ' + initialPassword);
  console.log('Keep this password private and change it after signing in.');
}

function openBrowser() {
  if (args.has('--no-open') || process.env.CI === 'true') return;
  const url = baseUrl + '/login';
  const command =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    console.log('Open ' + url);
  }
}

try {
  await inspectMongo();
  if (inspectOnly) {
    console.log('Inspection completed. No server started.');
  } else {
    child = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', String(port)], {
      env: childEnv,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      exited = true;
      process.exitCode = code ?? 0;
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        if (!exited) child.kill(signal);
      });
    }
    await waitForServer();
    await bootstrapUser();
    console.log('');
    console.log('SITE MAPPER MONGODB + MQTT READY FOR LOCAL REVIEW');
    console.log('Inventory: existing MongoDB ' + databaseName + ' (NO SEED)');
    console.log('Telemetry: subscribed on demand to ' + childEnv.MQTT_TOPIC_FILTER);
    console.log('The actual broker subscription and breaker mapping must be checked after login.');
    console.log('Login: ' + baseUrl + '/login');
    console.log('Diagnostics: ' + baseUrl + '/api/telemetry/diagnostics');
    console.log('');
    openBrowser();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (child && !exited) child.kill('SIGTERM');
  process.exitCode = 1;
}
