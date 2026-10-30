import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const mongoContainer = 'site-mapper-seed-01-mongodb-1';
const appContainer = 'site-mapper-seed-01-site-mapper-1';
const devHost = process.env.VISUAL_DEV_HOST || '127.0.0.1';
const devPort = Number(process.env.VISUAL_DEV_PORT || '3002');

function dockerText(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function requireRunning(name) {
  let state;
  try {
    state = dockerText(['inspect', '-f', '{{.State.Running}}', name]);
  } catch {
    throw new Error(
      name + ' is not available. Start the seed-01 Docker lab first; visual-dev never starts or changes it.',
    );
  }
  if (state !== 'true') {
    throw new Error(
      name + ' is not running. Start seed-01 first; visual-dev will not start/stop Docker services.',
    );
  }
}

function publishedPort(name, containerPort, protocol = 'tcp') {
  const raw = dockerText(['port', name, containerPort + '/' + protocol]);
  const line = raw.split(/\r?\n/).find(Boolean);
  if (!line) throw new Error('No published port for ' + name + ' ' + containerPort + '/' + protocol);
  const match = line.match(/:(\d+)$/);
  if (!match) throw new Error('Could not parse Docker published port: ' + line);
  return Number(match[1]);
}

async function requirePortFree(host, port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(new Error('Visual-dev port ' + host + ':' + port + ' is already in use.')),
    );
    server.listen(port, host, () => server.close(resolve));
  });
}

function safeEnvironment() {
  const env = { ...process.env };

  // Never inherit industrial writer/ingest credentials into the visual process.
  for (const key of Object.keys(env)) {
    if (
      key === 'BOOTSTRAP_ADMIN_TOKEN' ||
      key === 'TELEMETRY_STORE_TOKEN' ||
      key === 'MODBUS_BRIDGE_TOKEN' ||
      key === 'INDUSTRIAL_PROJECTION_TOKEN' ||
      key === 'INDUSTRIAL_INGEST_SOURCES_JSON' ||
      key === 'SNMP_INGEST_TOKEN' ||
      key.startsWith('SNMP_V3_') ||
      key === 'MQTT_PASSWORD'
    ) {
      delete env[key];
    }
  }
  return env;
}

try {
  requireRunning(mongoContainer);
  requireRunning(appContainer);
  await requirePortFree(devHost, devPort);

  const mongoPort = publishedPort(mongoContainer, 27017);
  const upstreamPort = publishedPort(appContainer, 3000);

  const env = {
    ...safeEnvironment(),
    APP_ENV: 'development',
    APP_PERSISTENCE: 'mongodb',
    MONGODB_URI: 'mongodb://127.0.0.1:' + mongoPort + '/?directConnection=true',
    MONGODB_DB_NAME: 'seed-01',
    SITE_MAPPER_SEED_PROFILE: 'seed-01',

    // Hard safety boundary: this process renders/reads only.
    TELEMETRY_ENABLED: 'false',
    TELEMETRY_HISTORY_ENABLED: 'false',
    INDUSTRIAL_TIMESCALE_ENABLED: 'false',
    SITE_MAPPER_VISUAL_DEV_READ_ONLY: 'true',
    SITE_MAPPER_VISUAL_DEV_UPSTREAM: 'http://127.0.0.1:' + upstreamPort,
  };

  console.log('');
  console.log('SITE MAPPER VISUAL DEV');
  console.log('Docker seed-01 remains untouched.');
  console.log('Real runtime: http://127.0.0.1:' + upstreamPort);
  console.log('Visual dev:   http://' + devHost + ':' + devPort);
  console.log('Mongo:        read from existing seed-01 on 127.0.0.1:' + mongoPort);
  console.log('Telemetry:    proxied read-only from real runtime');
  console.log('Mutations:    BLOCKED (except login/logout)');
  console.log('');

  const child = spawn(process.execPath, [nextBin, 'dev', '-H', devHost, '-p', String(devPort)], {
    env,
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
