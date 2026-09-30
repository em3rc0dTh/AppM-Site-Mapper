export const TELEMETRY_HISTORY_WINDOWS = ['24h', '7d', '15d', '1M'] as const;

export type TelemetryHistoryWindow = (typeof TELEMETRY_HISTORY_WINDOWS)[number];

export interface TelemetryHistoryPoint {
  readonly observedAt: string;
  readonly voltageV: number | null;
  readonly currentA: number | null;
  readonly powerW: number | null;
  readonly energyKwh: number | null;
  readonly activeBreakers: number;
}

export interface TelemetryHistoryResponse {
  readonly deviceId: string;
  readonly sourceIdentity: string;
  readonly scope: {
    readonly kind: 'BDFB' | 'PANEL';
    readonly label: string;
    readonly panelId?: string;
    readonly breakerCount: number;
    readonly holderCount: number;
  };
  readonly window: TelemetryHistoryWindow;
  readonly points: readonly TelemetryHistoryPoint[];
}
