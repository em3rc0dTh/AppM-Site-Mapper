import type {
  TelemetryAcceptanceRepository,
  TelemetryHistoryClaimOptions,
  TelemetryHistoryStats,
} from '@/modules/telemetry/application/telemetry-acceptance-repository';
import type {
  TelemetryAcceptanceRecord,
  TelemetryAcceptanceResult,
} from '@/modules/telemetry/domain/acceptance';

function boundedLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 1000);
}

function requireTimestamp(name: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid ISO timestamp.`);
  }
  return parsed;
}

function isDue(record: TelemetryAcceptanceRecord, now: string): boolean {
  if (record.historyState === 'PENDING') {
    return record.nextHistoryAttemptAt === undefined || record.nextHistoryAttemptAt <= now;
  }

  return (
    record.historyState === 'IN_FLIGHT' &&
    record.historyLeaseUntil !== undefined &&
    record.historyLeaseUntil <= now
  );
}

export class MemoryTelemetryAcceptanceRepository implements TelemetryAcceptanceRepository {
  private readonly byEventId = new Map<string, TelemetryAcceptanceRecord>();
  private readonly eventIdByIdempotencyKey = new Map<string, string>();

  async accept(record: TelemetryAcceptanceRecord): Promise<TelemetryAcceptanceResult> {
    if (record.idempotencyKey) {
      const eventId = this.eventIdByIdempotencyKey.get(record.idempotencyKey);
      if (eventId) {
        const existing = this.byEventId.get(eventId);
        if (!existing) {
          throw new Error('Telemetry acceptance index is inconsistent.');
        }

        return {
          kind: existing.payloadSha256 === record.payloadSha256 ? 'DUPLICATE' : 'CONFLICT',
          record: structuredClone(existing),
        };
      }
    }

    if (this.byEventId.has(record.eventId)) {
      throw new Error('Telemetry eventId must be unique.');
    }

    const stored = structuredClone(record);
    this.byEventId.set(record.eventId, stored);

    if (record.idempotencyKey) {
      this.eventIdByIdempotencyKey.set(record.idempotencyKey, record.eventId);
    }

    return { kind: 'ACCEPTED', record: structuredClone(stored) };
  }

  async listPendingHistory(limit: number): Promise<readonly TelemetryAcceptanceRecord[]> {
    return [...this.byEventId.values()]
      .filter((record) => record.historyState === 'PENDING')
      .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt))
      .slice(0, boundedLimit(limit))
      .map((record) => structuredClone(record));
  }

  async historyStats(now: string): Promise<TelemetryHistoryStats> {
    const nowMs = requireTimestamp('Telemetry history stats now', now);
    const records = [...this.byEventId.values()];
    const pending = records.filter((record) => record.historyState === 'PENDING');
    const inFlight = records.filter((record) => record.historyState === 'IN_FLIGHT');
    const deadLettered = records.filter((record) => record.historyState === 'DEAD_LETTERED');
    const unresolved = [...pending, ...inFlight, ...deadLettered].sort((left, right) =>
      left.acceptedAt.localeCompare(right.acceptedAt),
    );
    const oldest = unresolved[0];
    const oldestMs = oldest ? requireTimestamp('Telemetry acceptedAt', oldest.acceptedAt) : null;

    return {
      generatedAt: now,
      pending: pending.length,
      duePending: pending.filter(
        (record) =>
          record.nextHistoryAttemptAt === undefined || record.nextHistoryAttemptAt <= now,
      ).length,
      inFlight: inFlight.length,
      expiredLeases: inFlight.filter(
        (record) =>
          record.historyLeaseUntil !== undefined && record.historyLeaseUntil <= now,
      ).length,
      delivered: records.filter((record) => record.historyState === 'DELIVERED').length,
      deadLettered: deadLettered.length,
      unresolved: unresolved.length,
      ...(oldest === undefined ? {} : { oldestUnresolvedAcceptedAt: oldest.acceptedAt }),
      ...(oldestMs === null
        ? {}
        : { oldestUnresolvedAgeSeconds: Math.max(0, Math.floor((nowMs - oldestMs) / 1000)) }),
    };
  }

  async claimPendingHistory(
    options: TelemetryHistoryClaimOptions,
  ): Promise<readonly TelemetryAcceptanceRecord[]> {
    if (!options.workerId.trim()) {
      throw new Error('Telemetry history workerId is required.');
    }

    if (!Number.isInteger(options.leaseSeconds) || options.leaseSeconds < 1) {
      throw new Error('Telemetry history leaseSeconds must be a positive integer.');
    }

    const nowMs = requireTimestamp('Telemetry history claim now', options.now);
    const leaseUntil = new Date(nowMs + options.leaseSeconds * 1000).toISOString();
    const eligible = [...this.byEventId.values()]
      .filter((record) => isDue(record, options.now))
      .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt))
      .slice(0, boundedLimit(options.limit));

    const claimed: TelemetryAcceptanceRecord[] = [];

    for (const record of eligible) {
      const { nextHistoryAttemptAt: _nextAttemptAt, ...withoutNextAttempt } = record;
      const next: TelemetryAcceptanceRecord = {
        ...withoutNextAttempt,
        historyState: 'IN_FLIGHT',
        historyAttempts: record.historyAttempts + 1,
        historyLeaseOwner: options.workerId,
        historyLeaseUntil: leaseUntil,
      };

      this.byEventId.set(record.eventId, next);
      claimed.push(structuredClone(next));
    }

    return claimed;
  }

  async markHistoryDelivered(
    eventId: string,
    workerId: string,
    deliveredAt: string,
  ): Promise<boolean> {
    const record = this.byEventId.get(eventId);
    if (!record || record.historyState !== 'IN_FLIGHT' || record.historyLeaseOwner !== workerId) {
      return false;
    }

    const {
      historyLeaseOwner: _leaseOwner,
      historyLeaseUntil: _leaseUntil,
      nextHistoryAttemptAt: _nextAttemptAt,
      historyLastErrorCode: _lastErrorCode,
      deadLetteredAt: _deadLetteredAt,
      ...rest
    } = record;

    const next: TelemetryAcceptanceRecord = {
      ...rest,
      historyState: 'DELIVERED',
      deliveredAt,
    };

    this.byEventId.set(eventId, next);
    return true;
  }

  async markHistoryDeadLettered(
    eventId: string,
    workerId: string,
    deadLetteredAt: string,
    errorCode: string,
  ): Promise<boolean> {
    const record = this.byEventId.get(eventId);
    if (!record || record.historyState !== 'IN_FLIGHT' || record.historyLeaseOwner !== workerId) {
      return false;
    }

    const {
      historyLeaseOwner: _leaseOwner,
      historyLeaseUntil: _leaseUntil,
      nextHistoryAttemptAt: _nextAttemptAt,
      deliveredAt: _deliveredAt,
      ...rest
    } = record;

    const next: TelemetryAcceptanceRecord = {
      ...rest,
      historyState: 'DEAD_LETTERED',
      historyLastErrorCode: errorCode,
      deadLetteredAt,
    };

    this.byEventId.set(eventId, next);
    return true;
  }

  async rescheduleHistory(
    eventId: string,
    workerId: string,
    nextAttemptAt: string,
    errorCode: string,
  ): Promise<boolean> {
    const record = this.byEventId.get(eventId);
    if (!record || record.historyState !== 'IN_FLIGHT' || record.historyLeaseOwner !== workerId) {
      return false;
    }

    const {
      historyLeaseOwner: _leaseOwner,
      historyLeaseUntil: _leaseUntil,
      deadLetteredAt: _deadLetteredAt,
      ...rest
    } = record;

    const next: TelemetryAcceptanceRecord = {
      ...rest,
      historyState: 'PENDING',
      nextHistoryAttemptAt: nextAttemptAt,
      historyLastErrorCode: errorCode,
    };

    this.byEventId.set(eventId, next);
    return true;
  }
}
