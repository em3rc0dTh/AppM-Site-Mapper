import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

export interface TelemetryBindingRepository {
  listForSource(protocol: TelemetryBinding['protocol'], sourceIdentity: string): Promise<readonly TelemetryBinding[]>;
  insert(binding: TelemetryBinding): Promise<void>;
  replace(binding: TelemetryBinding): Promise<void>;
}
