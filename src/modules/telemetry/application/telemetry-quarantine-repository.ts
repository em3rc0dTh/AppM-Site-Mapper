import type { TelemetryQuarantineRecord } from '@/modules/telemetry/domain/quarantine';

export interface TelemetryQuarantineRepository {
  record(entry: TelemetryQuarantineRecord): Promise<void>;
  listRecent(limit: number): Promise<readonly TelemetryQuarantineRecord[]>;
}
