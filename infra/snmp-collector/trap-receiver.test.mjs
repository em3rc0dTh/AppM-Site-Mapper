import { test } from 'node:test';
import assert from 'node:assert/strict';
import snmp from 'net-snmp';
import http from 'node:http';
import dgram from 'node:dgram';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiverProfiles, notificationEnvelope, startTrapReceiver } from './trap-receiver.mjs';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let i = 0; i < 150; i++) {
    if (check()) return;
    await pause(20);
  }
  throw new Error('Wire delivery timeout');
}
const base = {
  sourceIdentity: 'EMU-SNMP-1',
  address: '127.0.0.1',
  token: 'lab-only-ingest-token-123456789012345',
  version: '2c',
  community: 'lab-only',
};
test('source authentication binds sender IP and credentials; raw binary is preserved without secrets', () => {
  const profiles = receiverProfiles(JSON.stringify([base]));
  const pdu = {
    type: snmp.PduType.TrapV2,
    community: base.community,
    id: 1,
    varbinds: [{ oid: '1.3.6.1.4.1.99999.1.0', type: 4, value: Buffer.from([0, 255]) }],
  };
  const notification = { pdu, rinfo: { address: '127.0.0.1', size: 100 } };
  const captured = notificationEnvelope(notification, profiles);
  assert.equal(JSON.stringify(captured.envelope).includes(base.community), false);
  assert.deepEqual(captured.envelope.raw.varbinds[0].value, { encoding: 'base64', bytes: 'AP8=' });
  assert.equal(
    notificationEnvelope({ ...notification, rinfo: { address: '127.0.0.2', size: 100 } }, profiles),
    null,
  );
  assert.equal(
    notificationEnvelope({ ...notification, pdu: { ...pdu, community: 'wrong' } }, profiles),
    null,
  );
});
for (const mode of ['1', '2c', '3', 'inform'])
  test(`real SNMP ${mode} UDP -> durable outbox -> authenticated HTTP`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-mapper-traps-'));
    const user = {
      name: 'lab-user',
      level: 'authPriv',
      authProtocol: 'sha',
      authKey: 'lab-auth-password',
      privProtocol: 'aes',
      privKey: 'lab-priv-password',
    };
    const profile = {
      ...base,
      version: mode === 'inform' ? '2c' : mode,
      ...(mode === '3' ? { user } : {}),
    };
    const received = [];
    let fail = true;
    const server = http.createServer(async (req, res) => {
      let raw = '';
      for await (const part of req) raw += part;
      assert.equal(req.headers.authorization, `Bearer ${base.token}`);
      if (fail) {
        res.writeHead(503);
        res.end();
        return;
      }
      received.push(JSON.parse(raw));
      res.writeHead(202);
      res.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const probe = dgram.createSocket('udp4');
    probe.bind(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    probe.close();
    let service, session;
    try {
      const config = {
        profiles: receiverProfiles(JSON.stringify([profile])),
        url: `http://127.0.0.1:${server.address().port}/api`,
        spoolDirectory: directory,
        port,
        retryMs: 30,
      };
      service = await startTrapReceiver(config);
      await pause(30);
      const options = {
        trapPort: port,
        port,
        version: mode === '3' ? snmp.Version3 : mode === '1' ? snmp.Version1 : snmp.Version2c,
        retries: 1,
        timeout: 500,
      };
      session =
        mode === '3'
          ? snmp.createV3Session(
              '127.0.0.1',
              {
                ...user,
                level: snmp.SecurityLevel.authPriv,
                authProtocol: snmp.AuthProtocols.sha,
                privProtocol: snmp.PrivProtocols.aes,
              },
              options,
            )
          : snmp.createSession('127.0.0.1', base.community, options);
      const vars = [{ oid: '1.3.6.1.4.1.99999.1.0', type: snmp.ObjectType.Integer, value: 0 }];
      await new Promise((resolve, reject) =>
        session[mode === 'inform' ? 'inform' : 'trap']('1.3.6.1.4.1.12148.10.1.2.1', vars, (e) =>
          e ? reject(e) : resolve(),
        ),
      );
      await until(() => service.pending.size === 1);
      // Recover the pending capture after receiver restart; no invented fresh timestamp.
      service.close();
      await pause(30);
      fail = false;
      service = await startTrapReceiver(config);
      await until(() => received.length > 0);
      assert.equal(received[0].protocol, 'SNMP');
      assert.equal(received[0].raw.varbinds.at(-1).value, 0);
      assert.equal(received[0].transport, mode === 'inform' ? 'inform' : 'trap');
      assert.equal(JSON.stringify(received[0]).includes(base.community), false);
    } finally {
      session?.close();
      service?.close();
      await pause(70);
      await new Promise((r) => server.close(r));
      await rm(directory, { recursive: true, force: true });
    }
  });
test('optional GET/GETNEXT/GETBULK feeds preserve original varbinds without SET', async () => {
  async function udpPort() {
    const socket = dgram.createSocket('udp4');
    socket.bind(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    socket.close();
    return port;
  }
  const port = await udpPort(),
    trapPort = await udpPort();
  const agent = snmp.createAgent(
    {
      port,
      address: '127.0.0.1',
      disableAuthorization: false,
      accessControlModelType: snmp.AccessControlModelType.Simple,
    },
    () => {},
  );
  const auth = agent.getAuthorizer();
  auth.addCommunity('read-test-only');
  auth.getAccessControlModel().setCommunityAccess('read-test-only', snmp.AccessLevel.ReadOnly);
  const mib = agent.getMib();
  mib.registerProvider({
    name: 'lab-voltage',
    type: snmp.MibProviderType.Scalar,
    oid: '1.3.6.1.4.1.99999.2',
    scalarType: snmp.ObjectType.Integer,
    maxAccess: snmp.MaxAccess['read-only'],
  });
  mib.setScalarValue('lab-voltage', 48);
  const directory = await mkdtemp(join(tmpdir(), 'snmp-read-outbox-'));
  const received = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    received.push(JSON.parse(body));
    res.writeHead(202);
    res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const method of ['get', 'getnext', 'getbulk']) {
      const profile = {
        ...base,
        sourceIdentity: 'EMU-READ-' + method,
        community: 'read-test-only',
        poll: {
          method,
          port,
          intervalMs: 5000,
          oids: [method === 'get' ? '1.3.6.1.4.1.99999.2.0' : '1.3.6.1.4.1.99999.2'],
        },
      };
      const service = await startTrapReceiver({
        profiles: receiverProfiles(JSON.stringify([profile])),
        url: `http://127.0.0.1:${server.address().port}/ingest`,
        spoolDirectory: directory,
        port: trapPort,
        retryMs: 20,
      });
      try {
        await until(() => received.some((p) => p.transport === method));
        const p = received.find((p) => p.transport === method);
        assert.equal(p.raw.varbinds.find((v) => v.oid === '1.3.6.1.4.1.99999.2.0').value, 48);
      } finally {
        service.close();
        await pause(30);
      }
    }
  } finally {
    agent.close();
    await new Promise((r) => server.close(r));
    await rm(directory, { recursive: true, force: true });
  }
});
