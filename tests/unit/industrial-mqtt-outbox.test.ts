import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MqttObservationOutbox } from '@/modules/telemetry/infrastructure/industrial/mqtt-outbox';
import type { Envelope } from '@/modules/telemetry/domain/industrial/observations';
const envelope: Envelope = {
  protocol: 'MQTT',
  transport: 'publish',
  sourceIdentity: 'EMU-1',
  topic: 'data/dev/EMU-1',
  receivedAt: '2026-10-23T17:00:00.000Z',
  raw: { reported: { future: 'uninterpreted' } },
};
describe('durable MQTT observation outbox', () => {
  it('recovers after database failure/restart without refreshing acquisition time or inventing source IDs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mqtt-outbox-test-'));
    let calls = 0;
    const first = new MqttObservationOutbox(
      dir,
      async () => {
        calls++;
        throw new Error('database down');
      },
      () => {},
      1,
    );
    try {
      await first.start();
      const id = await first.enqueue(envelope);
      await first.flush();
      expect(calls).toBeGreaterThan(0);
      expect(first.pending()).toBe(1);
      await expect(first.enqueue(envelope)).rejects.toThrow('full');
      await first.close();
      const delivered: Envelope[] = [];
      const second = new MqttObservationOutbox(
        dir,
        async (e) => {
          delivered.push(e);
        },
        () => {},
      );
      await second.start();
      await second.flush();
      await second.close();
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toMatchObject({ ...envelope, captureId: id });
      expect(delivered[0]?.messageId).toBeUndefined();
      expect(second.pending()).toBe(0);
    } finally {
      await first.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
