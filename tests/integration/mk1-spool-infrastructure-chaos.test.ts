import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MqttObservationOutbox } from '@/modules/telemetry/infrastructure/industrial/mqtt-outbox';
import type { Envelope } from '@/modules/telemetry/domain/industrial/observations';

const enabled = process.env.CI_CHAOS_LOCAL_ONLY === 'true';
const captures = 24;

function record(index: number): Envelope {
  return {
    protocol: 'MQTT',
    transport: 'publish',
    sourceIdentity: 'CI-CHAOS-GATEWAY',
    topic: 'data/dev/CI-CHAOS-GATEWAY',
    receivedAt: new Date(Date.UTC(2026, 9, 26, 12, 0, index)).toISOString(),
    messageId: 'chaos-observation-' + index,
    raw: { sequence: index, voltage: 12.3 },
  };
}

describe.skipIf(!enabled)('MK1 MQTT spool recovery under delivery outage', () => {
  it('keeps fsynced captures while delivery fails and replays all 24 through a restarted consumer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mk1-chaos-spool-'));
    const sent = new Map<string, Envelope>();
    const first = new MqttObservationOutbox(
      directory,
      async () => { throw new Error('injected downstream outage'); },
      () => undefined,
      30,
      60000,
    );
    try {
      await first.start();
      const ids = await Promise.all(
        Array.from({ length: captures }, (_, i) => first.enqueue(record(i))),
      );
      expect(new Set(ids).size).toBe(captures);
      await first.flush();
      expect(first.pending()).toBe(captures);
      expect(first.diagnostics().counters.deliveryFailures).toBeGreaterThan(0);
      await first.close();

      const files = (await readdir(directory)).filter((name) =>
        /^[a-f0-9-]{36}\.json$/.test(name),
      );
      expect(files).toHaveLength(captures);
      const second = new MqttObservationOutbox(
        directory,
        async (value) => {
          if (!value.captureId) throw new Error('Missing durable capture identity');
          if (sent.has(value.captureId)) throw new Error('Unexpected duplicate replay');
          sent.set(value.captureId, value);
        },
        () => { throw new Error('Unexpected replay delivery failure'); },
        30,
        60000,
      );
      try {
        await second.start();
        await second.flush();
        expect(second.pending()).toBe(0);
      } finally {
        await second.close();
      }
      expect(sent.size).toBe(captures);
      const sourceTimes = [...sent.values()].map((e) => e.receivedAt).sort();
      expect(sourceTimes).toEqual(Array.from({ length: captures }, (_, i) => record(i).receivedAt).sort());

      const third = new MqttObservationOutbox(
        directory,
        async () => { throw new Error('Already delivered records replayed'); },
        () => undefined,
        30,
        60000,
      );
      await third.start();
      await third.flush();
      expect(third.pending()).toBe(0);
      await third.close();
      console.log('[CHAOS PASS] 24 durable spool captures recovered after downstream outage');
    } finally {
      await first.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
