import type { CanonicalTelemetryEvent } from '@/modules/telemetry/domain/canonical';

export interface TelemetryHistorySink {
  write(event: CanonicalTelemetryEvent): Promise<void>;
}
