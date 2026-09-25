import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

// Each run owns a new disposable database; never connects to production persistence.
const mongoUri = process.env.E2E_MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const host = new URL(mongoUri).hostname;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
  throw new Error('Physical-flow certification requires local test MongoDB.');
}
const env = {
  ...process.env,
  APP_ENV: 'development',
  APP_PERSISTENCE: 'mongodb',
  MONGODB_URI: mongoUri,
  MONGODB_DB_NAME: `appm_flow_cert_${randomBytes(8).toString('hex')}`,
  BOOTSTRAP_ADMIN_TOKEN: randomBytes(32).toString('hex'),
  TELEMETRY_ENABLED: 'false',
  TELEMETRY_DEMO_HISTORY: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  E2E_BASE_URL: 'http://127.0.0.1:3100',
};
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'],
  { env, stdio: 'inherit' },
);
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Certification app failed to start.');
    try {
      ready = (await fetch(`${env.E2E_BASE_URL}/login`)).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Certification app did not become ready.');
  const runner = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    env,
    stdio: 'inherit',
  });
  process.exitCode = await new Promise((resolve) =>
    runner.once('exit', (code) => resolve(code ?? 1)),
  );
} finally {
  server.kill('SIGTERM');
}
