export type TelemetryEntityKind = 'DEVICE' | 'EQUIPMENT';
export type TelemetryTimestampProvenance = 'DEVICE' | 'RECEIVED_TIME_FALLBACK';

export interface TelemetrySource {
  readonly id: string;
  readonly entityId: string;
  readonly entityKind: TelemetryEntityKind;
  readonly topicSource: string;
  readonly expectedSerialNumber: string;
  readonly protocolProfile: string;
  readonly rawSchemaVersion: string;
  readonly staleAfterSeconds: number;
  readonly enabled: boolean;
}

export interface TelemetrySample {
  readonly entityId: string;
  readonly entityKind: TelemetryEntityKind;
  readonly sourceId: string;
  /**
   * Transitional display alias retained for the current UI.
   * It is the Device/Equipment serial number, not an authentication principal.
   */
  readonly sourceIdentity: string;
  readonly serialNumber: string;
  readonly protocolProfile: string;
  readonly rawSchemaVersion: string;
  readonly reported: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly timestampProvenance: TelemetryTimestampProvenance;
  readonly sequence?: number;
  readonly producerEpoch?: string;
  readonly messageId?: string;
}

export interface NormalizedTelemetryMessage {
  readonly topic: string;
  readonly topicSource: string;
  readonly serialNumber: string;
  readonly reported: Readonly<Record<string, unknown>>;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly timestampProvenance: TelemetryTimestampProvenance;
  readonly sequence?: number;
  readonly producerEpoch?: string;
  readonly messageId?: string;
}
