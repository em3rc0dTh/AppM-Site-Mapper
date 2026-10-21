import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export interface TelemetryHistoryWriter {
  write(sample: TelemetrySample): Promise<void>;
  writeDurable?(sample: TelemetrySample): Promise<void>;
  /** Optional durability-backed anti-replay read; supported by HttpTelemetryStore. */
  queryLatestEntities?(
    targetIds: readonly string[],
    targetType: TelemetrySample['targetType'],
  ): Promise<readonly TelemetrySample[]>;
}

export interface TelemetryHistoryWriterDiagnostics {
  readonly enabled: boolean;
  readonly writes: number;
  readonly rowsAccepted: number;
  readonly failures: number;
  readonly lastWriteAt: string | null;
  readonly lastError: string | null;
}
