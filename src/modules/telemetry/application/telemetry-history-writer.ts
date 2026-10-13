import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export interface TelemetryHistoryWriter {
  write(sample: TelemetrySample): Promise<void>;
}

export interface TelemetryHistoryWriterDiagnostics {
  readonly enabled: boolean;
  readonly writes: number;
  readonly rowsAccepted: number;
  readonly failures: number;
  readonly lastWriteAt: string | null;
  readonly lastError: string | null;
}
