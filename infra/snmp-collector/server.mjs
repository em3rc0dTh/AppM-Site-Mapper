import snmp from 'net-snmp';
import { normalizeVarbinds, pointsFromEnvironment } from './collector-core.mjs';

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function integerEnv(name, defaultValue, low, high) {
  const value = process.env[name] ? Number(process.env[name]) : defaultValue;
  if (!Number.isInteger(value) || value < low || value > high)
    throw new Error(`Invalid configuration: ${name}`);
  return value;
}

const config = {
  host: required('SNMP_CONTROLLER_HOST'),
  sourceIdentity: required('SNMP_CONTROLLER_ID'),
  username: required('SNMP_V3_USERNAME'),
  authKey: required('SNMP_V3_AUTH_KEY'),
  privKey: required('SNMP_V3_PRIV_KEY'),
  ingestToken: required('SNMP_INGEST_TOKEN'),
  ingestUrl: new URL(required('SNMP_INGEST_URL')),
  port: integerEnv('SNMP_CONTROLLER_PORT', 161, 1, 65535),
  pollMs: integerEnv('SNMP_POLL_INTERVAL_MS', 30_000, 5_000, 3_600_000),
  timeoutMs: integerEnv('SNMP_POLL_TIMEOUT_MS', 5_000, 500, 30_000),
  points: pointsFromEnvironment(required('SNMP_FEED_POINTS_JSON')),
};

if (config.authKey.length < 8 || config.privKey.length < 8 || config.ingestToken.length < 32)
  throw new Error('SNMPv3 passphrases must be >=8 chars and ingest token >=32 chars');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(config.sourceIdentity))
  throw new Error('SNMP_CONTROLLER_ID must be a stable single-segment source identity');
if (
  config.ingestUrl.protocol !== 'https:' &&
  (process.env.APP_ENV === 'production' || config.ingestUrl.protocol !== 'http:')
)
  throw new Error('Collector ingest must use HTTPS in production; HTTP only in isolated lab');
if (config.ingestUrl.username || config.ingestUrl.password)
  throw new Error('Do not embed credentials in SNMP_INGEST_URL');

const user = {
  name: config.username,
  level: snmp.SecurityLevel.authPriv,
  authProtocol: snmp.AuthProtocols.sha,
  authKey: config.authKey,
  privProtocol: snmp.PrivProtocols.aes,
  privKey: config.privKey,
};
const session = snmp.createV3Session(config.host, user, {
  version: snmp.Version3,
  port: config.port,
  retries: 1,
  timeout: config.timeoutMs,
  transport: 'udp4',
});

function getOids(oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) return reject(error);
      for (const varbind of varbinds ?? []) {
        if (snmp.isVarbindError(varbind))
          return reject(new Error(`SNMP varbind rejected: ${snmp.varbindError(varbind)}`));
      }
      resolve(varbinds);
    });
  });
}

let stopping = false;
let timer;

async function poll() {
  try {
    const varbinds = [];
    // Bound response size; a failed chunk cancels publication of the cycle.
    for (let i = 0; i < config.points.length; i += 12) {
      const group = config.points.slice(i, i + 12);
      varbinds.push(...(await getOids(group.map((p) => p.oid))));
    }
    const envelope = normalizeVarbinds(
      config.points,
      varbinds,
      new Date().toISOString(),
      config.sourceIdentity,
    );
    const response = await fetch(config.ingestUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ingestToken}`,
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(config.timeoutMs + 5_000),
    });
    if (!response.ok) throw new Error(`Site Mapper ingestion HTTP ${response.status}`);
    console.info(
      JSON.stringify({
        event: 'snmp.poll.accepted',
        sourceIdentity: config.sourceIdentity,
        pointCount: envelope.measurements.length,
        at: envelope.observedAt,
      }),
    );
  } catch (error) {
    // No secrets, host password or private response payload in logs.
    console.warn(
      JSON.stringify({
        event: 'snmp.poll.failed',
        sourceIdentity: config.sourceIdentity,
        reason: error instanceof Error ? error.message : 'unknown',
        at: new Date().toISOString(),
      }),
    );
  } finally {
    if (!stopping) timer = setTimeout(poll, config.pollMs);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    session.close();
  });
}
console.info(
  JSON.stringify({
    event: 'snmp.collector.started',
    sourceIdentity: config.sourceIdentity,
    pollIntervalMs: config.pollMs,
    pointCount: config.points.length,
  }),
);
await poll();
