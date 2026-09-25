import { describe, expect, it } from 'vitest';

import { TelemetryHistoryWriter } from '@/modules/telemetry/application/telemetry-history-writer';
import type { TelemetryHistorySink } from '@/modules/telemetry/application/telemetry-history-sink';
import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import { MYEMS_APPM_BREAKER_PROFILE } from '@/modules/telemetry/domain/myems-appm-breaker-adapter';
import { MemoryTelemetryAcceptanceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-acceptance-repository';

function record(
  eventId: string,
  reported: Record<string, unknown> = { '0_1_1': { U1: 48 } },
  protocolProfile = MYEMS_APPM_BREAKER_PROFILE,
): TelemetryAcceptanceRecord {
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
      protocolProfile,
      rawSchemaVersion: 'telxius-v1',
      reported,
      observedAt: '2026-09-24T00:00:00.000Z',
      receivedAt: '2026-09-24T00:00:01.000Z',
      timestampProvenance: 'DEVICE',
    },
  };
}

function writer(
  repository: MemoryTelemetryAcceptanceRepository,
  sink: TelemetryHistorySink,
): TelemetryHistoryWriter {
  return new TelemetryHistoryWriter(repository, sink, {
    workerId: 'worker-a',
    batchSize: 10,
    leaseSeconds: 30,
    retryBaseSeconds: 5,
    retryMaxSeconds: 60,
  });
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

  it('reschedules a transient sink failure with bounded exponential backoff', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1'));

    const sink: TelemetryHistorySink = {
      async write() {
        throw new Error('TsdbUnavailable');
      },
    };

    expect(await writer(repository, sink).runOnce('2026-09-24T00:00:02.000Z')).toEqual({
      claimed: 1,
      delivered: 0,
      deadLettered: 0,
      rescheduled: 1,
      leaseLost: 0,
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

  it('marks a successful canonical sink write delivered', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1'));
    const written: string[] = [];

    const sink: TelemetryHistorySink = {
      async write(event) {
        written.push(event.eventId);
        expect(event.metrics).toEqual([
          expect.objectContaining({
            componentAddress: '0_1_1',
            key: 'voltage_v',
            value: 48,
            unit: 'V',
          }),
        ]);
      },
    };

    expect(await writer(repository, sink).runOnce('2026-09-24T00:00:02.000Z')).toEqual({
      claimed: 1,
      delivered: 1,
      deadLettered: 0,
      rescheduled: 0,
      leaseLost: 0,
    });
    expect(written).toEqual(['event-1']);
    expect(await repository.listPendingHistory(10)).toHaveLength(0);
  });

  it('dead-letters a permanent canonicalization error instead of retrying forever', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1', { '0_1_1': { U1: 'not-a-number' } }));

    let sinkWrites = 0;
    const sink: TelemetryHistorySink = {
      async write() {
        sinkWrites += 1;
      },
    };

    expect(await writer(repository, sink).runOnce('2026-09-24T00:00:02.000Z')).toEqual({
      claimed: 1,
      delivered: 0,
      deadLettered: 1,
      rescheduled: 0,
      leaseLost: 0,
    });
    expect(sinkWrites).toBe(0);
    expect(
      await repository.claimPendingHistory({
        limit: 10,
        workerId: 'worker-b',
        now: '2026-09-25T00:00:00.000Z',
        leaseSeconds: 30,
      }),
    ).toHaveLength(0);
  });

  it('dead-letters unsupported protocol profiles while preserving the durable raw event', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1', {}, 'telxius-v1'));

    const sink: TelemetryHistorySink = {
      async write() {
        throw new Error('Sink must not be called for unsupported profiles.');
      },
    };

    expect(await writer(repository, sink).runOnce('2026-09-24T00:00:02.000Z')).toEqual({
      claimed: 1,
      delivered: 0,
      deadLettered: 1,
      rescheduled: 0,
      leaseLost: 0,
    });
    expect(await repository.listPendingHistory(10)).toHaveLength(0);
  });
});
