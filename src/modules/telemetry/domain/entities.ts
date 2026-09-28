export interface TelemetryMetricValue {
  readonly value: number;
  readonly observedAt: string;
}

export interface BreakerTelemetryMetrics {
  readonly voltageV?: TelemetryMetricValue;
  readonly currentA?: TelemetryMetricValue;
  readonly powerW?: TelemetryMetricValue;
  readonly energyKwh?: TelemetryMetricValue;
}

export interface BreakerTelemetryState {
  readonly value: string;
  readonly observedAt: string;
}

export interface BreakerTelemetryReading {
  readonly deviceId: string;
  readonly sourceIdentity: string;
  readonly shelfId: string;
  readonly frameId: string;
  readonly panelId: string;
  readonly panelLabel: string;
  readonly breakerId: string;
  readonly breakerLabel: string;
  readonly rawPointId: string;
  readonly position: number;
  readonly metrics: BreakerTelemetryMetrics;
  readonly state?: BreakerTelemetryState;
  readonly receivedAt: string;
}

export interface TelemetrySample {
  readonly entityId: string;
  readonly entityKind: 'DEVICE' | 'EQUIPMENT';
  readonly sourceIdentity: string;
  readonly reported: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
  readonly protocol?: 'GENERIC' | 'BFDB';
  readonly messageId?: string;
  readonly sourceObservedAt?: string;
  readonly sourceSentAt?: string;
  readonly breakerReadings?: readonly BreakerTelemetryReading[];
  readonly unmappedPointIds?: readonly string[];
}

export interface NormalizedTelemetryMessage {
  readonly sourceIdentity: string;
  readonly reported: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
  readonly topic: string;
  readonly protocol: 'GENERIC' | 'BFDB';
  readonly messageId?: string;
  readonly sourceObservedAt?: string;
  readonly sourceSentAt?: string;
}
