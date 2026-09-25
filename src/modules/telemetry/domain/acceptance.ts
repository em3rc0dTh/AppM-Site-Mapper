import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export type TelemetryHistoryState = 'PENDING' | 'IN_FLIGHT' | 'DELIVERED' | 'DEAD_LETTERED';

export interface TelemetryAcceptanceRecord {
  readonly eventId: string;
  readonly idempotencyKey?: string;
  readonly payloadSha256: string;
  readonly sample: TelemetrySample;
  readonly acceptedAt: string;
  readonly historyState: TelemetryHistoryState;
  readonly historyAttempts: number;
  readonly nextHistoryAttemptAt?: string;
  readonly historyLeaseUntil?: string;
  readonly historyLeaseOwner?: string;
  readonly historyLastErrorCode?: string;
  readonly deliveredAt?: string;
  readonly deadLetteredAt?: string;
}

export type TelemetryAcceptanceResult =
  | {
      readonly kind: 'ACCEPTED' | 'DUPLICATE';
      readonly record: TelemetryAcceptanceRecord;
    }
  | {
      readonly kind: 'CONFLICT';
      readonly record: TelemetryAcceptanceRecord;
    };
