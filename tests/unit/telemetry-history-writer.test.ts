import { describe, expect, it } from 'vitest';

import { TelemetryHistoryWriter } from '@/modules/telemetry/application/telemetry-history-writer';
import type { TelemetryHistorySink } from '@/modules/telemetry/application/telemetry-history-sink';
import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import { MemoryTelemetryAcceptanceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-acceptance-repository';

function record(eventId: string): TelemetryAcceptanceRecord {
  return {
    eventId,
    payloadSha256: 'a'.repeat(64),
    acceptedAt: '2026-09-24T00:00:00.000Z',
    historyState: 'PENDING',
    historyAttempts: 0,
    sample: {
      entityId: 'equipment-1',
      entityKind: 'EQUIPMENT',
      sourceId: 'source-1',
      sourceIdentity: 'SN-1',
      serialNumber: 'SN-1',
      rawSchemaVersion: 'telxius-v1',
      reported: { '0_1_1': { u: 48 } },
      observedAt: '2026-09-24T00:00:00.000Z',
      receivedAt: '2026-09-24T00:00:01.000Z',
      timestampProvenance: 'DEVICE',
    },
  };
}

describe('TelemetryHistoryWriter', () => {
  it('claims an event once while its lease is active and allows reclaim after lease expiry', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1'));

    const first = await repository.claimPendingHistory({
      limit: 10,
      workerId: 'worker-a',
      now: '2026-09-24T00:00:02.000Z',
      leaseSeconds: 30,
    });
    const second = await repository.claimPendingHistory({
      limit: 10,
      workerId: 'worker-b',
      now: '2026-09-24T00:00:03.000Z',
      leaseSeconds: 30,
    });
    const reclaimed = await repository.claimPendingHistory({
      limit: 10,
      workerId: 'worker-b',
      now: '2026-09-24T00:00:33.000Z',
      leaseSeconds: 30,
    });

    expect(first).toHaveLength(1);
    expect(first[0]?.historyAttempts).toBe(1);
    expect(second).toHaveLength(0);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.historyAttempts).toBe(2);
    expect(reclaimed[0]?.historyLeaseOwner).toBe('worker-b');
  });

  it('reschedules a failed write with bounded exponential backoff', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1'));

    const sink: TelemetryHistorySink = {
      async write() {
        throw new Error('TsdbUnavailable');
      },
    };

    const writer = new TelemetryHistoryWriter(repository, sink, {
      workerId: 'worker-a',
      batchSize: 10,
      leaseSeconds: 30,
      retryBaseSeconds: 5,
      retryMaxSeconds: 60,
    });

    expect(await writer.runOnce('2026-09-24T00:00:02.000Z')).toEqual({
      claimed: 1,
      delivered: 0,
      rescheduled: 1,
    });

    expect(
      await repository.claimPendingHistory({
        limit: 10,
        workerId: 'worker-b',
        now: '2026-09-24T00:00:06.000Z',
        leaseSeconds: 30,
      }),
    ).toHaveLength(0);

    expect(
      await repository.claimPendingHistory({
        limit: 10,
        workerId: 'worker-b',
        now: '2026-09-24T00:00:07.000Z',
        leaseSeconds: 30,
      }),
    ).toHaveLength(1);
  });

  it('marks a successful sink write delivered', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1'));
    const written: string[] = [];

    const sink: TelemetryHistorySink = {
      async write(entry) {
        written.push(entry.eventId);
      },
    };

    const writer = new TelemetryHistoryWriter(repository, sink, {
      workerId: 'worker-a',
      batchSize: 10,
      leaseSeconds: 30,
      retryBaseSeconds: 5,
      retryMaxSeconds: 60,
    });

    expect(await writer.runOnce('2026-09-24T00:00:02.000Z')).toEqual({
      claimed: 1,
      delivered: 1,
      rescheduled: 0,
    });
    expect(written).toEqual(['event-1']);
    expect(await repository.listPendingHistory(10)).toHaveLength(0);
  });
});
