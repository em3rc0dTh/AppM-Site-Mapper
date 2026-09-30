import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const mqttLab = args.has('--mqtt');
if (mqttLab && existsSync('.env.local')) {
  // Node 22 loads credentials locally without copying secrets into Git.
  process.loadEnvFile('.env.local');
}

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '127.0.0.1';
const baseUrl = `http://${host}:${port}`;
const loginUrl = `${baseUrl}/login`;
const email = process.env.LOCAL_ADMIN_EMAIL ?? 'admin@local.test';
const password =
  process.env.LOCAL_ADMIN_PASSWORD ?? `Local-${randomBytes(9).toString('base64url')}!Aa1`;
const displayName = process.env.LOCAL_ADMIN_NAME ?? 'Local Administrator';
const bootstrapToken = randomBytes(24).toString('base64url');
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const serials = ['EMU-BFDB-01', 'EMU-BFDB-02', 'EMU-BFDB-03'];

const child = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', String(port)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_ENV: 'development',
    APP_PERSISTENCE: 'memory',
    BOOTSTRAP_ADMIN_TOKEN: bootstrapToken,
    TELEMETRY_ENABLED: mqttLab ? 'true' : 'false',
    ...(mqttLab
      ? {
          MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883',
          MQTT_TOPIC_PREFIX: 'data/dev/',
          MQTT_TOPIC_FILTER: 'data/dev/#',
          MQTT_EXPECTED_SOURCES: serials.join(','),
          MQTT_SOURCE_DEVICE_MAP: '{}',
          BFDB_TELEMETRY_BINDING_MODE: 'explicit',
          BFDB_POSITIONS_PER_PANEL: '24',
        }
      : {}),
  },
});

let childExited = false;
child.on('exit', (code) => {
  childExited = true;
  process.exitCode = code ?? 0;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!childExited) child.kill(signal);
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (childExited) throw new Error('Next.js exited before the local server became ready.');
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('Timed out waiting for Site Mapper local server.');
}

async function bootstrapAndSeed() {
  const bootstrap = await fetch(`${baseUrl}/api/auth/bootstrap`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bootstrapToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!bootstrap.ok && bootstrap.status !== 409) {
    throw new Error(`Local admin bootstrap failed with HTTP ${bootstrap.status}.`);
  }

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Local admin login failed with HTTP ${login.status}.`);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Local login did not return a session cookie.');

  const seed = await fetch(`${baseUrl}/api/dev/seed-demo`, {
    method: 'POST',
    headers: { cookie },
  });
  if (!seed.ok) throw new Error(`Demo seed failed with HTTP ${seed.status}.`);

  if (mqttLab) {
    const lab = await fetch(`${baseUrl}/api/dev/seed-bfdb-emulator`, {
      method: 'POST',
      headers: { cookie },
    });
    if (!lab.ok) {
      throw new Error(`Emulator lab seed failed with HTTP ${lab.status}: ${await lab.text()}`);
    }
    const data = await lab.json();
    if (data.devices?.length !== 3 || data.devices.some((device) => device.breakerCount !== 96)) {
      throw new Error('Expected three synthetic BFDBs with 96 explicit breakers each.');
    }
  }
  return cookie;
}

async function verifyEmulator(cookie) {
  const deadline = Date.now() + 90_000;
  let last = null;
  console.log('Waiting for a real broker subscription and 3 × 96 accepted BFDB points…');
  while (Date.now() < deadline) {
    if (childExited) throw new Error('Next.js exited during MQTT commissioning.');
    try {
      const response = await fetch(`${baseUrl}/api/telemetry/diagnostics`, {
        headers: { cookie },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Diagnostics HTTP ${response.status}`);
      last = await response.json();

      const complete =
        last.connection === 'subscribed' &&
        serials.every((serial) => {
          const sample = last.sources.find((source) => source.serial === serial);
          return (
            sample?.freshness === 'LIVE' &&
            sample?.pointCount === 96 &&
            sample?.mappedBreakerCount === 96 &&
            sample?.unmappedPointCount === 0
          );
        });
      if (complete) return last;
    } catch (error) {
      last = { status: error instanceof Error ? error.message : 'Unknown diagnostics error' };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const summary = {
    connection: last?.connection ?? last?.status ?? 'unknown',
    lastError: last?.lastConnectionError,
    rawMessages: last?.rawMessages ?? 0,
    acceptedMessages: last?.acceptedMessages ?? 0,
    rejectedMessages: last?.rejectedMessages ?? 0,
    sources: last?.sources?.map((s) => ({
      serial: s.serial,
      raw: s.rawMessages,
      points: s.pointCount,
      breakers: s.mappedBreakerCount,
      unmapped: s.unmappedPointCount,
      freshness: s.freshness,
    })),
  };
  throw new Error(
    'MQTT emulator commissioning did not reach 3 × 96 live points.\n' +
      JSON.stringify(summary, null, 2) +
      '\nStart your BFDB emulator and broker on port 1883; check .env.local and ACLs.',
  );
}

function openBrowser(url) {
  if (args.has('--no-open') || process.env.CI === 'true') return;
  const command =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Opening the browser is best effort.
  }
}

try {
  await waitForHealth();
  const cookie = await bootstrapAndSeed();
  const verified = mqttLab ? await verifyEmulator(cookie) : null;
  console.log('');
  console.log(mqttLab ? 'Site Mapper MQTT EMULATOR VERIFIED.' : 'Site Mapper local demo is ready.');
  console.log(`URL:      ${loginUrl}`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  if (verified) {
    console.log('Broker:   subscribed to data/dev/# (confirmed SUBACK)');
    for (const sample of verified.sources) {
      console.log(
        `${sample.serial}: ${sample.pointCount}/96 raw points, ${sample.mappedBreakerCount}/96 breakers, ${sample.freshness}`,
      );
    }
    console.log(`Diagnostics: ${baseUrl}/api/telemetry/diagnostics`);
  }
  console.log('');
  console.log(
    'This lab is synthetic, in memory and resets on stop. It is NOT real surveyed inventory.',
  );
  console.log('Press Ctrl+C to stop the local server.');
  console.log('');
  openBrowser(mqttLab ? `${baseUrl}/network` : loginUrl);
} catch (error) {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  if (!childExited) child.kill('SIGTERM');
  process.exitCode = 1;
}
