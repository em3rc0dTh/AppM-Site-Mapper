import type {
  TelemetryAcceptanceRecord,
  TelemetryAcceptanceResult,
} from '@/modules/telemetry/domain/acceptance';

export interface TelemetryHistoryClaimOptions {
  readonly limit: number;
  readonly workerId: string;
  readonly now: string;
  readonly leaseSeconds: number;
}

export interface TelemetryHistoryStats {
  readonly generatedAt: string;
  readonly pending: number;
  readonly duePending: number;
  readonly inFlight: number;
  readonly expiredLeases: number;
  readonly delivered: number;
  readonly deadLettered: number;
  readonly unresolved: number;
  readonly oldestUnresolvedAcceptedAt?: string;
  readonly oldestUnresolvedAgeSeconds?: number;
}

export interface TelemetryAcceptanceRepository {
  accept(record: TelemetryAcceptanceRecord): Promise<TelemetryAcceptanceResult>;
  listPendingHistory(limit: number): Promise<readonly TelemetryAcceptanceRecord[]>;
  historyStats(now: string): Promise<TelemetryHistoryStats>;
  claimPendingHistory(
    options: TelemetryHistoryClaimOptions,
  ): Promise<readonly TelemetryAcceptanceRecord[]>;
  markHistoryDelivered(eventId: string, workerId: string, deliveredAt: string): Promise<boolean>;
  markHistoryDeadLettered(
    eventId: string,
    workerId: string,
    deadLetteredAt: string,
    errorCode: string,
  ): Promise<boolean>;
  rescheduleHistory(
    eventId: string,
    workerId: string,
    nextAttemptAt: string,
    errorCode: string,
  ): Promise<boolean>;
}
