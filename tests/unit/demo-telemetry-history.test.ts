import { describe, expect, it } from 'vitest';

import {
  DEMO_TELEMETRY_HISTORY_RANGE_MS,
  parseDemoTelemetryHistoryRange,
} from '@/modules/telemetry/application/demo-telemetry-history';

describe('demo telemetry history contract', () => {
  it('accepts only the supported operator ranges', () => {
    expect(parseDemoTelemetryHistoryRange('24h')).toBe('24h');
    expect(parseDemoTelemetryHistoryRange('7d')).toBe('7d');
    expect(parseDemoTelemetryHistoryRange('30d')).toBe('30d');
    expect(parseDemoTelemetryHistoryRange('1y')).toBeNull();
    expect(parseDemoTelemetryHistoryRange(null)).toBeNull();
  });

  it('keeps range durations explicit and deterministic', () => {
    expect(DEMO_TELEMETRY_HISTORY_RANGE_MS['24h']).toBe(86_400_000);
    expect(DEMO_TELEMETRY_HISTORY_RANGE_MS['7d']).toBe(604_800_000);
    expect(DEMO_TELEMETRY_HISTORY_RANGE_MS['30d']).toBe(2_592_000_000);
  });
});
