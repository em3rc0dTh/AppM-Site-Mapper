import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
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

const child = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', String(port)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_ENV: 'development',
    APP_PERSISTENCE: 'memory',
    BOOTSTRAP_ADMIN_TOKEN: bootstrapToken,
    TELEMETRY_ENABLED: 'false',
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
    if (childExited) {
      throw new Error('Next.js exited before the local server became ready.');
    }

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

  if (!login.ok) {
    throw new Error(`Local admin login failed with HTTP ${login.status}.`);
  }

  const setCookie = login.headers.get('set-cookie');
  const cookie = setCookie?.split(';', 1)[0];

  if (!cookie) {
    throw new Error('Local login did not return a session cookie.');
  }

  const seed = await fetch(`${baseUrl}/api/dev/seed-demo`, {
    method: 'POST',
    headers: { cookie },
  });

  if (!seed.ok) {
    throw new Error(`Demo seed failed with HTTP ${seed.status}.`);
  }
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
    // Browser opening is best effort. The URL is always printed below.
  }
}

try {
  await waitForHealth();
  await bootstrapAndSeed();

  console.log('');
  console.log('Site Mapper local demo is ready.');
  console.log(`URL:      ${loginUrl}`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('');
  console.log('The demo uses in-memory persistence and resets when this process stops.');
  console.log('Press Ctrl+C to stop the local server.');
  console.log('');

  openBrowser(loginUrl);
} catch (error) {
  console.error('');
  console.error(error instanceof Error ? error.message : error);
  if (!childExited) child.kill('SIGTERM');
  process.exitCode = 1;
}
