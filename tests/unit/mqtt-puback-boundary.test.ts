import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtime = fs.readFileSync(
  new URL('../../src/modules/telemetry/infrastructure/telemetry-runtime.ts', import.meta.url),
  'utf8',
);

describe('MQTT PUBACK durable-capture boundary', () => {
  it('detaches LIVE processing after durable capture so PUBACK is not held by downstream work', () => {
    const capture = runtime.indexOf('await industrialOutbox!.enqueue(envelope);');
    const detached = runtime.indexOf('void (async () => {', capture);
    const ingest = runtime.indexOf('service.ingest(topic, payload, receivedAt)', detached);
    const liveFailure = runtime.indexOf('telemetry.live.processing_failed', ingest);

    expect(capture).toBeGreaterThanOrEqual(0);
    expect(detached).toBeGreaterThan(capture);
    expect(ingest).toBeGreaterThan(detached);
    expect(liveFailure).toBeGreaterThan(ingest);
  });

  it('keeps the production guarantee explicit: fsynced spool before PUBACK', () => {
    expect(runtime).toContain('Profiled sources: fsynced spool before PUBACK.');
    expect(runtime).toContain('MQTT_DURABLE_CAPTURE_FAILED');
  });
});
