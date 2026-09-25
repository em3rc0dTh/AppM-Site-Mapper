import { describe, expect, it } from 'vitest';

import { AuditService } from '@/modules/audit/application/audit-service';
import { MemoryAuditRepository } from '@/modules/audit/infrastructure/memory-audit-repository';
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
      protocolProfile: 'myems-appm-breaker-v1',
      rawSchemaVersion: 'telxius-v1',
      reported: { '0_1_1': { U1: 48 } },
      observedAt: '2026-09-24T00:00:00.000Z',
      receivedAt: '2026-09-24T00:00:00.000Z',
      timestampProvenance: 'DEVICE',
    },
  };
}

describe('telemetry dead-letter replay', () => {
  it('atomically requeues only a dead-lettered event and preserves attempt history', async () => {
    const repository = new MemoryTelemetryAcceptanceRepository();
    await repository.accept(record('event-1'));

    const claimed = await repository.claimPendingHistory({
      limit: 1,
      workerId: 'worker-a',
      now: '2026-09-24T00:00:01.000Z',
      leaseSeconds: 30,
    });
    expect(claimed).toHaveLength(1);

    await repository.markHistoryDeadLettered(
      'event-1',
      'worker-a',
      '2026-09-24T00:00:02.000Z',
      'INVALID_METRIC_VALUE',
    );

    const replay = await repository.requeueDeadLettered('event-1');

    expect(replay).toMatchObject({
      previousErrorCode: 'INVALID_METRIC_VALUE',
      previousDeadLetteredAt: '2026-09-24T00:00:02.000Z',
      record: {
        eventId: 'event-1',
        historyState: 'PENDING',
        historyAttempts: 1,
      },
    });
    expect(replay?.record).not.toHaveProperty('deadLetteredAt');
    expect(replay?.record).not.toHaveProperty('historyLastErrorCode');

    await expect(repository.requeueDeadLettered('event-1')).resolves.toBeNull();

    const reclaimed = await repository.claimPendingHistory({
      limit: 1,
      workerId: 'worker-b',
      now: '2026-09-24T00:00:03.000Z',
      leaseSeconds: 30,
    });
    expect(reclaimed[0]).toMatchObject({
      eventId: 'event-1',
      historyAttempts: 2,
      historyLeaseOwner: 'worker-b',
    });
  });

  it('supports an audit event without persisting raw telemetry payload', async () => {
    const auditRepository = new MemoryAuditRepository();
    const audit = new AuditService(auditRepository, () => '2026-09-24T00:00:03.000Z');

    const event = await audit.record({
      actor: { type: 'USER', userId: 'superadmin-1' },
      action: 'TELEMETRY.HISTORY_REQUEUED',
      target: { kind: 'TELEMETRY_EVENT', id: 'event-1' },
      metadata: {
        sourceId: 'source-1',
        entityId: 'equipment-1',
        historyAttempts: 1,
        previousErrorCode: 'INVALID_METRIC_VALUE',
      },
    });

    expect(event).toMatchObject({
      action: 'TELEMETRY.HISTORY_REQUEUED',
      target: { kind: 'TELEMETRY_EVENT', id: 'event-1' },
      metadata: {
        sourceId: 'source-1',
        entityId: 'equipment-1',
        historyAttempts: 1,
        previousErrorCode: 'INVALID_METRIC_VALUE',
      },
    });
    expect(JSON.stringify(event)).not.toContain('reported');
  });
});
