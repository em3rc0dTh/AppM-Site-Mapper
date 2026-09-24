import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';

export interface TelemetryHistorySink {
  write(record: TelemetryAcceptanceRecord): Promise<void>;
}
