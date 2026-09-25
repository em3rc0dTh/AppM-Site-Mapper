import { describe, expect, it } from 'vitest';

import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import { MemoryTelemetryAcceptanceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-acceptance-repository';

function record(eventId: string, acceptedAt: string): TelemetryAcceptanceRecord {
  return {
    eventId,
    payloadSha256: 'a'.repeat(64),
    acceptedAt,
    historyState: 'PENDING',
    historyAttempts: 0,
    sample: {
      entityId: 'equipment-1',
      entityKind: 'EQUIPMENT',
      sourceId: 'source-1',
      sourceIdentity: 'SN-1',
      serialNumber: 'SN-1',
      protocolProfile: 'myems-appm-breaker-v1',
      rawSchemaVersion: 'telxius-v1',
      reported: { '0_1_1': { U1: 48 } },
      observedAt: acceptedAt,
      receivedAt: acceptedAt,
      timestampProvenance: 'DEVICE',
    },
  };
}

describe('telemetry outbox operational stats', () => {
  it('reports backlog state without exposing payload contents', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();

    await repository.accept(record('pending-due', '2026-09-24T00:00:00.000Z'));
    await repository.accept(record('pending-future', '2026-09-24T00:01:00.000Z'));
    await repository.accept(record('in-flight', '2026-09-24T00:03:00.000Z'));
    await repository.accept(record('delivered', '2026-09-24T00:05:00.000Z'));
    await repository.accept(record('dead-lettered', '2026-09-24T00:07:00.000Z'));

    await repository.claimPendingHistory({
      limit: 1,
      workerId: 'future-worker',
      now: '2026-09-24T00:02:00.000Z',
      leaseSeconds: 30,
    });
    await repository.rescheduleHistory(
      'pending-due',
      'future-worker',
      '2026-09-24T00:20:00.000Z',
      'TSDB_UNAVAILABLE',
    );

    await repository.claimPendingHistory({
      limit: 1,
      workerId: 'flight-worker',
      now: '2026-09-24T00:04:00.000Z',
      leaseSeconds: 30,
    });

    await repository.claimPendingHistory({
      limit: 1,
      workerId: 'delivered-worker',
      now: '2026-09-24T00:06:00.000Z',
      leaseSeconds: 30,
    });
    await repository.markHistoryDelivered(
      'delivered',
      'delivered-worker',
      '2026-09-24T00:06:01.000Z',
    );

    await repository.claimPendingHistory({
      limit: 1,
      workerId: 'dead-worker',
      now: '2026-09-24T00:08:00.000Z',
      leaseSeconds: 30,
    });
    await repository.markHistoryDeadLettered(
      'dead-lettered',
      'dead-worker',
      '2026-09-24T00:08:01.000Z',
      'INVALID_METRIC_VALUE',
    );

    expect(await repository.historyStats('2026-09-24T00:10:00.000Z')).toEqual({
      generatedAt: '2026-09-24T00:10:00.000Z',
      pending: 2,
      duePending: 1,
      inFlight: 1,
      expiredLeases: 1,
      delivered: 1,
      deadLettered: 1,
      unresolved: 4,
      oldestUnresolvedAcceptedAt: '2026-09-24T00:00:00.000Z',
      oldestUnresolvedAgeSeconds: 600,
    });
  });

  it('returns zeroed operational state for an empty outbox', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();

    expect(await repository.historyStats('2026-09-24T00:10:00.000Z')).toEqual({
      generatedAt: '2026-09-24T00:10:00.000Z',
      pending: 0,
      duePending: 0,
      inFlight: 0,
      expiredLeases: 0,
      delivered: 0,
      deadLettered: 0,
      unresolved: 0,
    });
  });
});
