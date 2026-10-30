import snmp from 'net-snmp';

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required configuration: ${name}`);
  return value.trim();
}
function integerEnv(name, fallback, low, high) {
  const value = process.env[name] ? Number(process.env[name]) : fallback;
  if (!Number.isInteger(value) || value < low || value > high)
    throw new Error(`Invalid configuration: ${name}`);
  return value;
}

const host = required('SNMP_CONTROLLER_HOST');
const sourceIdentity = required('SNMP_CONTROLLER_ID');
const ingestUrl = new URL(required('INDUSTRIAL_INGEST_URL'));
const ingestToken = required('INDUSTRIAL_INGEST_TOKEN');
const version = process.env.SNMP_VERSION || '2c';
const port = integerEnv('SNMP_CONTROLLER_PORT', 1161, 1, 65535);
const pollMs = integerEnv('SNMP_POLL_INTERVAL_MS', 10000, 5000, 3600000);
const timeoutMs = integerEnv('SNMP_POLL_TIMEOUT_MS', 5000, 500, 30000);
const points = JSON.parse(required('SNMP_OPERATIONAL_POINTS_JSON'));

if (!Array.isArray(points) || points.length < 1 || points.length > 128)
  throw new Error('SNMP_OPERATIONAL_POINTS_JSON must contain 1..128 numeric OIDs');
if (points.some((oid) => typeof oid !== 'string' || !/^\d+(?:\.\d+){5,}$/.test(oid)))
  throw new Error('Invalid operational SNMP OID');
if (!['2c', '3'].includes(version)) throw new Error('SNMP_VERSION must be 2c or 3');
if (ingestToken.length < 32) throw new Error('INDUSTRIAL_INGEST_TOKEN must be >=32 chars');
if (ingestUrl.protocol !== 'http:' && ingestUrl.protocol !== 'https:')
  throw new Error('INDUSTRIAL_INGEST_URL must use HTTP(S)');

const session =
  version === '3'
    ? snmp.createV3Session(
        host,
        {
          name: required('SNMP_V3_USERNAME'),
          level: snmp.SecurityLevel.authPriv,
          authProtocol: snmp.AuthProtocols.sha,
          authKey: required('SNMP_V3_AUTH_KEY'),
          privProtocol: snmp.PrivProtocols.aes,
          privKey: required('SNMP_V3_PRIV_KEY'),
        },
        { version: snmp.Version3, port, retries: 1, timeout: timeoutMs, transport: 'udp4' },
      )
    : snmp.createSession(host, required('SNMP_COMMUNITY'), {
        version: snmp.Version2c,
        port,
        retries: 1,
        timeout: timeoutMs,
        transport: 'udp4',
      });

function get(oids) {
  return new Promise((resolve, reject) => {
    session.get(oids, (error, varbinds) => {
      if (error) return reject(error);
      resolve(varbinds ?? []);
    });
  });
}

function scalar(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value === 'bigint') return value.toString();
  return value;
}

let stopping = false;
let timer = null;
async function poll() {
  try {
    const varbinds = [];
    for (let index = 0; index < points.length; index += 12) {
      const batch = await get(points.slice(index, index + 12));
      for (const item of batch) {
        if (snmp.isVarbindError(item)) continue;
        varbinds.push({
          oid: item.oid,
          type: typeof item.value === 'number' ? 'number' : 'string',
          value: scalar(item.value),
        });
      }
    }
    if (!varbinds.length) throw new Error('No operational SNMP varbinds returned');
    const now = new Date().toISOString();
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ingestToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        protocol: 'SNMP',
        sourceIdentity,
        transport: 'get',
        observedAt: now,
        receivedAt: now,
        raw: { varbinds },
      }),
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });
    if (!response.ok) throw new Error(`Site Mapper industrial ingest HTTP ${response.status}`);
    console.info(
      JSON.stringify({
        event: 'snmp.operational.poll.accepted',
        sourceIdentity,
        pointCount: varbinds.length,
        at: now,
      }),
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'snmp.operational.poll.failed',
        sourceIdentity,
        reason: error instanceof Error ? error.message : 'unknown',
        at: new Date().toISOString(),
      }),
    );
  } finally {
    if (!stopping) timer = setTimeout(poll, pollMs);
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
    event: 'snmp.operational.collector.started',
    sourceIdentity,
    pointCount: points.length,
    snmpVersion: version,
  }),
);
await poll();
