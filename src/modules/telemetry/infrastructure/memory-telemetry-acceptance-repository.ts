import type { TelemetryAcceptanceRepository } from '@/modules/telemetry/application/telemetry-acceptance-repository';
import type {
  TelemetryAcceptanceRecord,
  TelemetryAcceptanceResult,
} from '@/modules/telemetry/domain/acceptance';

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
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 1000);

    return [...this.byEventId.values()]
      .filter((record) => record.historyState === 'PENDING')
      .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt))
      .slice(0, boundedLimit)
      .map((record) => structuredClone(record));
  }
}
