export interface TelemetryQuarantineRecord {
  readonly id: string;
  readonly receivedAt: string;
  readonly expiresAt: string;
  readonly topic: string;
  readonly failureCode: string;
  readonly payloadBytes: number;
  readonly payloadSha256: string;
  readonly sourceId?: string;
  readonly claimedSerialNumber?: string;
}
