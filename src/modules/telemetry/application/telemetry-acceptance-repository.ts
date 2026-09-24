import type {
  TelemetryAcceptanceRecord,
  TelemetryAcceptanceResult,
} from '@/modules/telemetry/domain/acceptance';

export interface TelemetryAcceptanceRepository {
  accept(record: TelemetryAcceptanceRecord): Promise<TelemetryAcceptanceResult>;
  listPendingHistory(limit: number): Promise<readonly TelemetryAcceptanceRecord[]>;
}
