export interface TelemetrySample {
  readonly entityId: string;
  readonly entityKind: 'DEVICE' | 'EQUIPMENT';
  readonly sourceIdentity: string;
  readonly reported: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
}

export interface NormalizedTelemetryMessage {
  readonly sourceIdentity: string;
  readonly reported: Readonly<Record<string, unknown>>;
  readonly receivedAt: string;
  readonly topic: string;
}
