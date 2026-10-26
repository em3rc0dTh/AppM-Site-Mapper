import { describe, it, expect } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import dgram from 'node:dgram';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await delay(40);
  }
  throw new Error('Industrial chain timeout');
}
const loadModule = (path: string) => import(/* @vite-ignore */ pathToFileURL(resolve(path)).href);
const uri = process.env.INDUSTRIAL_TEST_MONGO_URI;
describe.skipIf(!uri || !process.env.BFDB_TRAPS_MODULE)(
  'industrial complete laboratory chain',
  () => {
    it('captures 3 QDF plus a fourth source, persists alarms, and replays projection into real Modbus TCP', async () => {
      process.env.APP_ENV = 'test';
      process.env.APP_PERSISTENCE = 'mongodb';
      process.env.MONGODB_URI = uri;
      process.env.MONGODB_DB_NAME = 'industrial_chain_' + Date.now();
      process.env.TELEMETRY_ENABLED = 'true';
      process.env.INDUSTRIAL_MQTT_SPOOL = await mkdtemp(join(tmpdir(), 'mqtt-chain-spool-'));
      process.env.TELEMETRY_HISTORY_ENABLED = 'false';
      const tokens = Object.fromEntries(
        [1, 2, 3].map((i) => [`EMU-SNMP-${i}`, `test-only-source-${i}-private-token-123456789`]),
      );
      process.env.INDUSTRIAL_INGEST_SOURCES_JSON = JSON.stringify(tokens);
      process.env.INDUSTRIAL_PROJECTION_TOKEN = 'test-only-projection-token-123456789012345';
      process.env.INDUSTRIAL_PROFILES_JSON = JSON.stringify([
        ...[1, 2, 3, 4].map((i) => ({
          sourceIdentity: `EMU-MQTT-${i}`,
          protocol: 'MQTT',
          version: 'lab-1',
          staleMs: 30000,
          rules: [{ key: '/reported/0_1_1/U1', kind: 'measurement', unit: 'V', scale: 1 }],
        })),
        ...[1, 2, 3].map((i) => ({
          sourceIdentity: `EMU-SNMP-${i}`,
          protocol: 'SNMP',
          version: 'eltek-54-lab',
          mib: 'eltek-rev54',
          staleMs: 30000,
          rules: [],
        })),
      ]);
      const [
        { POST: ingest },
        { POST: projection },
        { getObservationStore },
        { getTelemetryRuntime },
        { getClient },
      ] = await Promise.all([
        import('@/app/api/telemetry/industrial/ingest/route'),
        import('@/app/api/telemetry/industrial/projection/route'),
        import('@/modules/telemetry/infrastructure/industrial/runtime'),
        import('@/modules/telemetry/infrastructure/telemetry-runtime'),
        import('@/shared/infrastructure/mongodb/client'),
      ]);
      const { startTrapReceiver } = await loadModule('infra/snmp-collector/trap-receiver.mjs');
      const { startBridge } = await loadModule('infra/modbus-tcp/server.mjs');
      const { sendEltekTrap } = await loadModule(process.env.BFDB_TRAPS_MODULE!);
      const spool = await mkdtemp(join(tmpdir(), 'industrial-chain-'));
      const errors: number[] = [];
      const api = http.createServer(async (req, res) => {
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const response = await (req.url === '/projection' ? projection : ingest)(
            new Request('http://127.0.0.1' + req.url, {
              method: 'POST',
              headers: {
                authorization: String(req.headers.authorization ?? ''),
                'content-type': 'application/json',
              },
              body: Buffer.concat(chunks).toString(),
            }),
          );
          if (!response.ok) errors.push(response.status);
          res.writeHead(response.status);
          res.end(await response.text());
        } catch {
          errors.push(500);
          res.writeHead(500);
          res.end();
        }
      });
      api.listen(0, '127.0.0.1');
      await once(api, 'listening');
      const apiPort = (api.address() as net.AddressInfo).port;
      const sockets = new Set<net.Socket>();
      const broker = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        socket.on('data', (data) => {
          if (data[0] === 0x10) socket.write(Buffer.from([0x20, 2, 0, 0]));
          if (data[0] === 0x82) {
            socket.write(Buffer.from([0x90, 3, data[2]!, data[3]!, 0]));
            for (let i = 1; i <= 4; i++) {
              const topic = Buffer.from(`data/dev/EMU-MQTT-${i}`),
                payload = Buffer.from(
                  JSON.stringify({ reported: { '0_1_1': { U1: 40 + i, future: 'raw' } } }),
                );
              const content = Buffer.alloc(2 + topic.length + payload.length);
              content.writeUInt16BE(topic.length);
              topic.copy(content, 2);
              payload.copy(content, 2 + topic.length);
              socket.write(Buffer.concat([Buffer.from([0x30, content.length]), content]));
            }
          }
        });
      });
      broker.listen(0, '127.0.0.1');
      await once(broker, 'listening');
      process.env.MQTT_BROKER_URL = `mqtt://127.0.0.1:${(broker.address() as net.AddressInfo).port}`;
      const probe = dgram.createSocket('udp4');
      probe.bind(0, '127.0.0.1');
      await once(probe, 'listening');
      const trapPort = probe.address().port;
      probe.close();
      const profiles = [1, 2, 3].map((i) => ({
        sourceIdentity: `EMU-SNMP-${i}`,
        address: '127.0.0.1',
        version: '2c',
        community: `synthetic-${i}`,
        token: tokens[`EMU-SNMP-${i}`],
      }));
      const receiver = await startTrapReceiver({
        profiles,
        url: `http://127.0.0.1:${apiPort}/ingest`,
        spoolDirectory: spool,
        port: trapPort,
        retryMs: 30,
      });
      const runtime = await getTelemetryRuntime();
      let bridge: Awaited<ReturnType<typeof startBridge>> | undefined;
      const clients: net.Socket[] = [];
      try {
        const store = await getObservationStore();
        await until(
          async () => (await store.list()).filter((s) => s.key.endsWith('/U1')).length === 4,
        );
        for (let i = 1; i <= 3; i++)
          await sendEltekTrap(
            { host: '127.0.0.1', port: trapPort, version: '2c', community: `synthetic-${i}` },
            { name: 'alarmPowerSystemTrap', active: true, counter: i, unknown: true },
          );
        await until(
          async () =>
            (await store.list()).filter((s) => s.kind === 'alarm' && s.alarmState === 'ACTIVE')
              .length === 3,
        );
        expect(errors).toEqual([]);
        const signals = await store.list();
        expect(signals.filter((s) => s.key === '1.3.6.1.4.1.99999.1.0')).toHaveLength(3);
        const mqtt = signals.find(
          (s) => s.sourceIdentity === 'EMU-MQTT-1' && s.key.endsWith('/U1'),
        )!;
        const alarm = signals.find((s) => s.sourceIdentity === 'EMU-SNMP-1' && s.kind === 'alarm')!;
        expect(mqtt.id).toBe(
          createHash('sha256')
            .update(
              JSON.stringify(['MQTT', 'EMU-MQTT-1', 'data/dev/EMU-MQTT-1', '/reported/0_1_1/U1']),
            )
            .digest('hex'),
        );
        const registry = {
          version: 1,
          points: [
            {
              signalId: mqtt.id,
              unitId: 1,
              address: 1024,
              unit: 'V',
              description: 'Synthetic voltage',
            },
            {
              signalId: alarm.id,
              unitId: 1,
              address: 1027,
              unit: '',
              description: 'Synthetic alarm',
            },
          ],
        };
        const config = {
          sourceMap: { 'EMU-MQTT-1': 1 },
          token: 'test-only-bridge-123456789012345',
          registry,
          projectionUrl: `http://127.0.0.1:${apiPort}/projection`,
          projectionToken: process.env.INDUSTRIAL_PROJECTION_TOKEN,
          modbusPort: 0,
          ingestPort: 0,
        };
        async function openBridge() {
          const b = startBridge(config);
          await Promise.all([once(b.modbus, 'listening'), once(b.ingest, 'listening')]);
          return b;
        }
        bridge = await openBridge();
        await until(async () => bridge.state.extensions.signals.size === 2);
        async function read(address: number) {
          const client = net.connect(bridge.modbus.address().port, '127.0.0.1');
          clients.push(client);
          await once(client, 'connect');
          const packet = Buffer.from([0, 1, 0, 0, 0, 6, 1, 3, 0, 0, 0, 3]);
          packet.writeUInt16BE(address, 8);
          const promise = once(client, 'data');
          client.write(packet);
          const [response] = await promise;
          client.destroy();
          return { value: response.readFloatBE(9), quality: response.readUInt16BE(13) };
        }
        expect(await read(1024)).toEqual({ value: 41, quality: 1 });
        expect(await read(1027)).toEqual({ value: 1, quality: 1 });
        await bridge.close();
        bridge = await openBridge();
        await until(async () => bridge.state.extensions.signals.size === 2);
        expect(await read(1027)).toEqual({ value: 1, quality: 1 });
        await sendEltekTrap(
          { host: '127.0.0.1', port: trapPort, version: '2c', community: 'synthetic-1' },
          { name: 'alarmPowerSystemTrap', active: false, counter: 99 },
        );
        await until(async () =>
          (await store.list('EMU-SNMP-1')).some(
            (s) => s.kind === 'alarm' && s.alarmState === 'RESOLVED',
          ),
        );
        await until(
          async () => bridge.state.extensions.signals.get(alarm.id)?.alarmState === 'RESOLVED',
        );
        expect(await read(1027)).toEqual({ value: 0, quality: 1 });
        expect(
          (await store.history(alarm.id, new Date(Date.now() + 1000).toISOString(), 100)).length,
        ).toBe(2);
        console.info(
          'WIRE CHAIN PASS: MQTT 4 sources + SNMP 3 sources -> real Mongo -> authenticated projection -> TCP Modbus -> restart -> explicit alarm clear',
        );
      } finally {
        await runtime.stop();
        receiver.close();
        for (const client of clients) client.destroy();
        if (bridge) await bridge.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((r) => broker.close(() => r()));
        await new Promise<void>((r) => api.close(() => r()));
        const client = await getClient();
        await client.db(process.env.MONGODB_DB_NAME).dropDatabase();
        await client.close();
        await rm(spool, { recursive: true, force: true });
        await rm(process.env.INDUSTRIAL_MQTT_SPOOL!, { recursive: true, force: true });
      }
    }, 30000);
  },
);
