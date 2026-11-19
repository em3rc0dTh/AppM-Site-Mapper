import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
}

describe('MQTT transport receive timestamp contract', () => {
  it('captures receivedAt when the PUBLISH packet enters the socket, before async processing', () => {
    const mqtt = source('src/modules/telemetry/infrastructure/native-mqtt-source.ts');

    const parsed = mqtt.indexOf('const publish = parsePublish(packet);');
    const receivedAt = mqtt.indexOf('const receivedAt = new Date().toISOString();', parsed);
    const queued = mqtt.indexOf('processing = processing', receivedAt);
    const callback = mqtt.indexOf(
      'await this.onMessage(publish.topic, publish.payload, receivedAt);',
      queued,
    );

    expect(parsed).toBeGreaterThanOrEqual(0);
    expect(receivedAt).toBeGreaterThan(parsed);
    expect(queued).toBeGreaterThan(receivedAt);
    expect(callback).toBeGreaterThan(queued);
  });

  it('passes the transport timestamp through runtime into telemetry ingest', () => {
    const runtime = source('src/modules/telemetry/infrastructure/telemetry-runtime.ts');

    expect(runtime).toContain('async (topic, payload, receivedAt) =>');
    expect(runtime).toContain('const now = receivedAt;');
    expect(runtime).toContain('service.ingest(topic, payload, receivedAt)');
  });
});
