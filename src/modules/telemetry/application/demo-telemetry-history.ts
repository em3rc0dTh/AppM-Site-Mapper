export type DemoTelemetryHistoryRange = '24h' | '7d' | '30d';

export const DEMO_TELEMETRY_HISTORY_RANGE_MS: Readonly<Record<DemoTelemetryHistoryRange, number>> =
  {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

export interface DemoTelemetryHistoryPoint {
  readonly observedAt: string;
  readonly state: string;
  readonly values: Readonly<Record<string, string>>;
}

export function parseDemoTelemetryHistoryRange(
  value: string | null,
): DemoTelemetryHistoryRange | null {
  return value === '24h' || value === '7d' || value === '30d' ? value : null;
}
