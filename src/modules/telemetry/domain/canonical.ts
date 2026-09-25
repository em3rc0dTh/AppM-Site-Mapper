import type {
  TelemetryEntityKind,
  TelemetryTimestampProvenance,
} from '@/modules/telemetry/domain/entities';

export type TelemetryMetricQuality =
  'VALID' | 'LAST_KNOWN' | 'STALE' | 'UNAVAILABLE' | 'INVALID' | 'CALCULATED' | 'SIMULATED';

export type TelemetryMetricDerivation = 'RAW' | 'CALCULATED';

export interface CanonicalTelemetryMetric {
  readonly componentAddress: string;
  readonly key: 'voltage_v' | 'current_a' | 'active_power_w';
  readonly channel: 1 | 2;
  readonly value: number;
  readonly unit: 'V' | 'A' | 'W';
  readonly quality: TelemetryMetricQuality;
  readonly derivation: TelemetryMetricDerivation;
  readonly rawKey: 'U1' | 'U2' | 'I1' | 'I2' | 'P1' | 'P2';
  readonly sourceState?: string;
}

export interface CanonicalTelemetryEvent {
  readonly schemaVersion: 1;
  readonly metricCatalogVersion: 'myems-appm-breaker-v1';
  readonly eventId: string;
  readonly sourceId: string;
  readonly entityId: string;
  readonly entityKind: TelemetryEntityKind;
  readonly serialNumber: string;
  readonly protocolProfile: string;
  readonly rawSchemaVersion: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly timestampProvenance: TelemetryTimestampProvenance;
  readonly sequence?: number;
  readonly producerEpoch?: string;
  readonly messageId?: string;
  readonly sourceMessageId?: string;
  readonly sourceTimestampSeconds?: number;
  readonly sourceSendTimeSeconds?: number;
  readonly sourceMethod?: string;
  readonly sourceVersion?: number;
  readonly simulated?: boolean;
  readonly metrics: readonly CanonicalTelemetryMetric[];
}
