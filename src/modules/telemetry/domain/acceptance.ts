import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export type TelemetryHistoryState = 'PENDING' | 'DELIVERED';

export interface TelemetryAcceptanceRecord {
  readonly eventId: string;
  readonly idempotencyKey?: string;
  readonly payloadSha256: string;
  readonly sample: TelemetrySample;
  readonly acceptedAt: string;
  readonly historyState: TelemetryHistoryState;
  readonly historyAttempts: number;
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
