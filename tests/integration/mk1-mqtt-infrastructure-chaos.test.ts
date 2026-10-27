import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { NativeMqttSource } from '@/modules/telemetry/infrastructure/native-mqtt-source';

const enabled = process.env.CI_CHAOS_LOCAL_ONLY === 'true';
const broker = 'mqtt://127.0.0.1:1883';
const topic = 'data/dev/chaos/GATEWAY-01';

async function eventually(check: () => boolean | Promise<boolean>, ms = 16000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('MQTT recovery deadline exceeded');
}

function publish(message: string) {
  execFileSync('mosquitto_pub', ['-h', '127.0.0.1', '-p', '1883', '-q', '1', '-t', topic, '-m', message], {
    timeout: 12000,
  });
}

describe.skipIf(!enabled)('MK1 MQTT real-broker infrastructure chaos', () => {
  it('recovers queued QoS1 messages across receiver restart and reconnects after broker outage', async () => {
    const received: string[] = [];
    const clientId = 'mk1-chaos-' + process.env.GITHUB_RUN_ID;
    const options = { brokerUrl: broker, topicFilter: 'data/dev/chaos/#', clientId, keepAliveSeconds: 10 };
    const receive = async (_topic: string, payload: Uint8Array) => {
      received.push(new TextDecoder().decode(payload));
    };
    let receiver = new NativeMqttSource(options, receive);
    try {
      receiver.start();
      await eventually(() => receiver.diagnostics().state === 'subscribed');
      publish('before-outage');
      await eventually(() => received.includes('before-outage'));

      // Simulate gateway process restart: subscriber disconnects while broker
      // persists the stable QoS1 session and buffers a newly published reading.
      receiver.stop();
      publish('offline-pending-reading');
      receiver = new NativeMqttSource(options, receive);
      receiver.start();
      await eventually(() => receiver.diagnostics().state === 'subscribed');
      await eventually(() => received.includes('offline-pending-reading'));
      expect(received.filter((m) => m === 'offline-pending-reading')).toHaveLength(1);

      const subscribedBeforeOutage = receiver.diagnostics().lastSubscribedAt;
      execFileSync('sudo', ['systemctl', 'stop', 'mosquitto'], { timeout: 12000 });
      await eventually(() => receiver.diagnostics().state === 'reconnecting');
      execFileSync('sudo', ['systemctl', 'start', 'mosquitto'], { timeout: 12000 });
      await eventually(
        () => receiver.diagnostics().state === 'subscribed' &&
          receiver.diagnostics().lastSubscribedAt !== subscribedBeforeOutage,
        25000,
      );
      publish('after-broker-recovery');
      await eventually(() => received.includes('after-broker-recovery'));
      expect(received).toContain('before-outage');
      expect(received).toContain('offline-pending-reading');
      expect(received).toContain('after-broker-recovery');
      console.log('[CHAOS PASS] MQTT persisted subscriber backlog and broker reconnect', {
        distinct: new Set(received).size,
        delivered: received.length,
      });
    } finally {
      receiver.stop();
      execFileSync('sudo', ['systemctl', 'start', 'mosquitto'], { timeout: 12000 });
    }
  }, 80000);
});
