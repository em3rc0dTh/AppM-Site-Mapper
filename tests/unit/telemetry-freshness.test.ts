import { describe, expect, it } from 'vitest';

import {
  BFDB_EXPECTED_INTERVAL_MS,
  BFDB_LIVE_MAX_AGE_MS,
  BFDB_OFFLINE_AFTER_MS,
  classifyTelemetryFreshness,
  isTelemetryTransportCurrent,
} from '@/modules/telemetry/domain/telemetry-freshness';

const receivedAt = '2026-11-06T23:00:00.000Z';
const now = Date.parse(receivedAt);

describe('BFDB telemetry freshness policy', () => {
  it('uses a nominal 5-minute cadence with jitter grace and three-interval offline cutoff', () => {
    expect(BFDB_EXPECTED_INTERVAL_MS).toBe(300_000);
    expect(BFDB_LIVE_MAX_AGE_MS).toBe(360_000);
    expect(BFDB_OFFLINE_AFTER_MS).toBe(900_000);

    expect(classifyTelemetryFreshness(receivedAt, receivedAt, now + 300_000)).toBe('LIVE');
    expect(classifyTelemetryFreshness(receivedAt, receivedAt, now + 360_000)).toBe('LIVE');
    expect(classifyTelemetryFreshness(receivedAt, receivedAt, now + 361_000)).toBe('STALE');
    expect(classifyTelemetryFreshness(receivedAt, receivedAt, now + 900_000)).toBe('STALE');
    expect(classifyTelemetryFreshness(receivedAt, receivedAt, now + 901_000)).toBe('OFFLINE');
  });

  it('reports embedded source clock skew without discarding a freshly received transport packet', () => {
    const sourceObservedAt = '2026-11-07T12:10:00.000Z';
    expect(classifyTelemetryFreshness(receivedAt, sourceObservedAt, now)).toBe('CLOCK SKEW');
    expect(isTelemetryTransportCurrent(receivedAt, now)).toBe(true);
  });

  it('stops projecting last-known current values after the offline cutoff', () => {
    expect(isTelemetryTransportCurrent(receivedAt, now + 900_000)).toBe(true);
    expect(isTelemetryTransportCurrent(receivedAt, now + 901_000)).toBe(false);
  });
});
