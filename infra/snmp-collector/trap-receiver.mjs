import snmp from 'net-snmp';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { mkdir, readdir, writeFile, rename, readFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function receiverProfiles(raw) {
  const profiles = JSON.parse(raw || '[]');
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 64)
    throw new Error('Invalid trap profiles');
  const principals = new Set();
  const ids = new Set(),
    users = new Set();
  for (const p of profiles) {
    if (
      !p ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(p.sourceIdentity) ||
      ids.has(p.sourceIdentity) ||
      !isIP(p.address) ||
      !['1', '2c', '3'].includes(p.version) ||
      typeof p.token !== 'string' ||
      p.token.length < 32
    )
      throw new Error('Invalid trap source');
    if (
      p.poll &&
      (!Number.isInteger(p.poll.intervalMs) ||
        p.poll.intervalMs < 5000 ||
        !['get', 'getnext', 'getbulk'].includes(p.poll.method) ||
        (p.version === '1' && p.poll.method === 'getbulk') ||
        !Array.isArray(p.poll.oids) ||
        !p.poll.oids.length ||
        p.poll.oids.length > 64 ||
        p.poll.oids.some(
          (oid) => typeof oid !== 'string' || !/^[0-2](?:\.[0-9]+){2,127}$/.test(oid),
        ))
    )
      throw new Error('Invalid read-only SNMP poll');
    const principal = JSON.stringify([
      p.address,
      p.version,
      p.version === '3' ? p.user?.name : p.community,
    ]);
    if (principals.has(principal)) throw new Error('Ambiguous trap principal');
    principals.add(principal);
    ids.add(p.sourceIdentity);
    if (p.version === '3') {
      if (
        !p.user ||
        typeof p.user.name !== 'string' ||
        users.has(p.user.name) ||
        !['noAuthNoPriv', 'authNoPriv', 'authPriv'].includes(p.user.level) ||
        (p.user.level !== 'noAuthNoPriv' &&
          (!snmp.AuthProtocols[p.user.authProtocol] ||
            typeof p.user.authKey !== 'string' ||
            p.user.authKey.length < 8)) ||
        (p.user.level === 'authPriv' &&
          (!snmp.PrivProtocols[p.user.privProtocol] ||
            typeof p.user.privKey !== 'string' ||
            p.user.privKey.length < 8))
      )
        throw new Error('Invalid trap USM user');
      users.add(p.user.name);
      if (process.env.APP_ENV === 'production' && p.user.level !== 'authPriv')
        throw new Error('Production traps require authPriv');
    } else if (typeof p.community !== 'string' || !p.community || /[\r\n]/.test(p.community))
      throw new Error('Invalid trap community');
  }
  return profiles;
}
function encoded(value) {
  if (Buffer.isBuffer(value)) return { encoding: 'base64', bytes: value.toString('base64') };
  if (typeof value === 'bigint') return { encoding: 'bigint', decimal: value.toString() };
  return value;
}
export function notificationEnvelope(notification, profiles, now = new Date().toISOString()) {
  const { pdu, rinfo } = notification;
  const version = pdu.user ? '3' : pdu.type === snmp.PduType.Trap ? '1' : '2c';
  const matches = profiles.filter(
    (p) =>
      p.address === rinfo.address &&
      p.version === version &&
      (version === '3' ? p.user.name === pdu.user : p.community === pdu.community),
  );
  if (
    matches.length !== 1 ||
    rinfo.size > 65507 ||
    !Array.isArray(pdu.varbinds) ||
    pdu.varbinds.length > 4096
  )
    return null;
  const profile = matches[0];
  // Authentication data is deliberately excluded from capture and logs.
  const { community: _community, user: _user, ...safePdu } = pdu;
  void _community;
  void _user;
  const varbinds = pdu.varbinds.map((v) => ({ oid: v.oid, type: v.type, value: encoded(v.value) }));
  const trapOid = pdu.varbinds.find((v) => v.oid === '1.3.6.1.6.3.1.1.4.1.0')?.value;
  const notificationOid =
    typeof trapOid === 'string'
      ? trapOid
      : version === '1'
        ? pdu.generic === 6
          ? `${pdu.enterprise}.0.${pdu.specific}`
          : `1.3.6.1.6.3.1.1.5.${pdu.generic + 1}`
        : undefined;
  const raw = { version, ...safePdu, varbinds };
  const hasCounter =
    pdu.varbinds.some((v) => v.oid === '1.3.6.1.2.1.1.3.0') || pdu.upTime !== undefined;
  const messageId =
    hasCounter || pdu.type === snmp.PduType.InformRequest
      ? createHash('sha256')
          .update(JSON.stringify([version, pdu.id, pdu.upTime, notificationOid, varbinds]))
          .digest('hex')
      : undefined;
  return {
    profile,
    envelope: {
      protocol: 'SNMP',
      sourceIdentity: profile.sourceIdentity,
      transport: pdu.type === snmp.PduType.InformRequest ? 'inform' : 'trap',
      receivedAt: now,
      origin: rinfo.address,
      raw,
      ...(notificationOid ? { notificationOid } : {}),
      ...(messageId ? { messageId } : {}),
    },
  };
}

/** Disk outbox is bounded; acknowledged informs are protocol acknowledgements, not DB commits. */
export async function startTrapReceiver({
  profiles,
  url,
  spoolDirectory,
  port = 1162,
  address = '127.0.0.1',
  maxPending = 1000,
  engineID,
  onStatus = () => {},
  retryMs = 1000,
}) {
  if (engineID && (!/^[a-fA-F0-9]{10,64}$/.test(engineID) || engineID.length % 2))
    throw new Error('Invalid receiver engine ID');
  const endpoint = new URL(url);
  if (
    endpoint.username ||
    endpoint.password ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    (process.env.APP_ENV === 'production' && endpoint.protocol !== 'https:')
  )
    throw new Error('Invalid trap ingest URL');
  if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 10000)
    throw new Error('Invalid trap queue bound');
  await mkdir(spoolDirectory, { recursive: true, mode: 0o700 });
  const files = (await readdir(spoolDirectory)).filter((f) => /^[a-f0-9-]+\.json$/.test(f));
  if (files.length > maxPending) throw new Error('Trap spool exceeds configured capacity');
  const savedCounters = {};
  try {
    const path = join(spoolDirectory, 'diagnostics.json');
    if ((await stat(path)).size > 65536) throw new Error('Oversized diagnostics');
    const old = JSON.parse(await readFile(path, 'utf8'));
    if (old.counters && typeof old.counters === 'object')
      for (const [key, value] of Object.entries(old.counters)) {
        if (/^(trap|snmp)\.[a-z_.]{1,60}$/.test(key) && Number.isSafeInteger(value) && value >= 0)
          savedCounters[key] = value;
      }
  } catch {
    /* First start has no persisted counters. */
  }
  const counters = savedCounters;
  let diagnosticWrites = Promise.resolve(),
    diagnosticWriteFailed = false;
  let diagnosticDirty = false,
    diagnosticWriting = false;
  const observer = onStatus;
  function snapshot() {
    const depth = pending.size + accepting,
      alerts = [];
    if (depth >= maxPending) alerts.push('SNMP_QUEUE_FULL');
    else if (depth >= Math.ceil(maxPending * 0.8)) alerts.push('SNMP_QUEUE_HIGH_WATER');
    if (
      counters['trap.queue.full'] ||
      counters['trap.spool.failed'] ||
      counters['trap.payload.too_large']
    )
      alerts.push('SNMP_CAPTURE_FAILURE_RECORDED');
    if (depth && counters['trap.delivery.retry']) alerts.push('SNMP_DELIVERY_RETRY');
    if (diagnosticWriteFailed) alerts.push('SNMP_DIAGNOSTIC_STORAGE_FAILED');
    return {
      version: 1,
      protocol: 'SNMP',
      updatedAt: new Date().toISOString(),
      pending: depth,
      capacity: maxPending,
      counters: { ...counters },
      alerts,
    };
  }
  function persistDiagnostics() {
    diagnosticDirty = true;
    if (diagnosticWriting) return;
    diagnosticWriting = true;
    diagnosticWrites = (async () => {
      while (diagnosticDirty) {
        diagnosticDirty = false;
        try {
          const path = join(spoolDirectory, 'diagnostics.json');
          await writeFile(path + '.tmp', JSON.stringify(snapshot()), { mode: 0o600 });
          await rename(path + '.tmp', path);
          diagnosticWriteFailed = false;
        } catch {
          diagnosticWriteFailed = true;
          break;
        }
      }
    })().finally(() => {
      diagnosticWriting = false;
    });
  }
  onStatus = (event) => {
    counters[event] = (counters[event] ?? 0) + 1;
    persistDiagnostics();
    observer(event);
  };
  const pending = new Set(files);
  let accepting = 0,
    stopping = false,
    timer,
    working = false;
  async function drain() {
    if (working || stopping) return;
    working = true;
    try {
      for (const file of pending) {
        try {
          const path = join(spoolDirectory, file);
          if ((await stat(path)).size > 262144) throw new Error('Invalid spool record');
          const envelope = JSON.parse(await readFile(path, 'utf8'));
          const profile = profiles.find((p) => p.sourceIdentity === envelope.sourceIdentity);
          if (!profile) {
            onStatus('trap.spool.uncommissioned');
            continue;
          }
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${profile.token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(envelope),
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) {
            onStatus('trap.delivery.retry');
            continue;
          }
          await unlink(path);
          pending.delete(file);
          onStatus('trap.delivery.committed');
        } catch {
          onStatus('trap.delivery.retry');
        }
      }
    } finally {
      working = false;
      persistDiagnostics();
      if (!stopping) timer = setTimeout(drain, retryMs);
    }
  }
  function enqueue(envelope) {
    if (Buffer.byteLength(JSON.stringify(envelope)) > 262144) {
      onStatus('trap.payload.too_large');
      return;
    }
    if (pending.size + accepting >= maxPending) {
      onStatus('trap.queue.full');
      return;
    }
    accepting++;
    const file = createHash('sha256').update(JSON.stringify(envelope)).digest('hex') + '.json';
    const path = join(spoolDirectory, file);
    void writeFile(path + '.tmp', JSON.stringify(envelope), { mode: 0o600 })
      .then(() => rename(path + '.tmp', path))
      .then(() => {
        pending.add(file);
        onStatus('trap.queued');
      })
      .catch(() => onStatus('trap.spool.failed'))
      .finally(() => accepting--);
  }
  const receiver = snmp.createReceiver(
    {
      port,
      address,
      transport: 'udp4',
      disableAuthorization: false,
      includeAuthentication: true,
      ...(engineID ? { engineID } : {}),
    },
    (error, notification) => {
      if (error || stopping) {
        onStatus('trap.rejected');
        return;
      }
      const packet = notificationEnvelope(notification, profiles);
      if (!packet) {
        onStatus('trap.unauthorized');
        return;
      }
      enqueue(packet.envelope);
    },
  );
  const authorizer = receiver.getAuthorizer();
  for (const profile of profiles) {
    if (profile.version === '3') {
      const user = profile.user;
      authorizer.addUser({
        ...user,
        level: snmp.SecurityLevel[user.level],
        authProtocol: snmp.AuthProtocols[user.authProtocol],
        privProtocol: snmp.PrivProtocols[user.privProtocol],
      });
    } else if (!authorizer.getCommunity(profile.community))
      authorizer.addCommunity(profile.community);
  }
  const pollers = [];
  for (const profile of profiles.filter((p) => p.poll)) {
    const options = {
      port: profile.poll.port ?? 161,
      retries: 1,
      timeout: 3000,
      version:
        profile.version === '3'
          ? snmp.Version3
          : profile.version === '1'
            ? snmp.Version1
            : snmp.Version2c,
    };
    const session =
      profile.version === '3'
        ? snmp.createV3Session(
            profile.address,
            {
              ...profile.user,
              level: snmp.SecurityLevel[profile.user.level],
              authProtocol: snmp.AuthProtocols[profile.user.authProtocol],
              privProtocol: snmp.PrivProtocols[profile.user.privProtocol],
            },
            options,
          )
        : snmp.createSession(profile.address, profile.community, options);
    const poller = { session, timer: undefined };
    pollers.push(poller);
    const poll = () => {
      const callback = (error, result) => {
        if (!stopping) {
          if (error) onStatus('snmp.poll.failed');
          else {
            const values = result.flat(Infinity).filter((v) => v && typeof v.oid === 'string');
            enqueue({
              protocol: 'SNMP',
              sourceIdentity: profile.sourceIdentity,
              transport: profile.poll.method,
              receivedAt: new Date().toISOString(),
              origin: profile.address,
              raw: {
                version: profile.version,
                varbinds: values.map((v) => ({
                  oid: v.oid,
                  type: v.type,
                  value: encoded(v.value ?? null),
                })),
              },
            });
          }
          poller.timer = setTimeout(poll, profile.poll.intervalMs);
        }
      };
      if (profile.poll.method === 'getbulk') session.getBulk(profile.poll.oids, 0, 8, callback);
      else
        session[profile.poll.method === 'getnext' ? 'getNext' : 'get'](profile.poll.oids, callback);
    };
    poll();
  }
  void drain();
  return {
    receiver,
    pending,
    diagnostics: snapshot,
    close() {
      if (stopping) return diagnosticWrites;
      stopping = true;
      clearTimeout(timer);
      receiver.close();
      persistDiagnostics();
      for (const poller of pollers) {
        clearTimeout(poller.timer);
        poller.session.close();
      }
      return diagnosticWrites;
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = await startTrapReceiver({
    profiles: receiverProfiles(process.env.SNMP_TRAP_SOURCES_JSON),
    url: process.env.INDUSTRIAL_INGEST_URL,
    spoolDirectory: process.env.SNMP_TRAP_SPOOL || '/data/traps',
    port: Number(process.env.SNMP_TRAP_PORT || 1162),
    maxPending: Number(process.env.SNMP_TRAP_MAX_PENDING ?? 1000),
    address: process.env.SNMP_TRAP_BIND_HOST || '127.0.0.1',
    ...(process.env.SNMP_TRAP_ENGINE_ID ? { engineID: process.env.SNMP_TRAP_ENGINE_ID } : {}),
    onStatus: (event) => console.info(JSON.stringify({ event })),
  });
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      service.close();
      process.exitCode = 0;
    });
}
