export type TelemetryFreshnessStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'CLOCK SKEW';

/** Nominal field cadence for Acrel AWT100/BFDB MQTT publishers: one packet every 5 minutes. */
export const BFDB_EXPECTED_INTERVAL_MS = 5 * 60_000;

/** Allow normal scheduler/network jitter without flipping a healthy 5-minute source to STALE. */
export const BFDB_LIVE_MAX_AGE_MS = Math.round(BFDB_EXPECTED_INTERVAL_MS * 1.2);

/** Three missed nominal intervals means the source is no longer considered connected. */
export const BFDB_OFFLINE_AFTER_MS = BFDB_EXPECTED_INTERVAL_MS * 3;

/** Source clocks may drift slightly; larger divergence is surfaced separately from transport health. */
export const TELEMETRY_CLOCK_SKEW_TOLERANCE_MS = 30_000;

function parsed(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Transport freshness is authoritative for connectivity.
 *
 * A BFDB may report a bad embedded clock while MQTT delivery is healthy. In that case
 * keep the fresh packet visible and surface CLOCK SKEW instead of falsely declaring
 * the equipment OFFLINE.
 */
export function classifyTelemetryFreshness(
  receivedAt: string,
  sourceObservedAt: string | undefined,
  now = Date.now(),
): TelemetryFreshnessStatus {
  const received = parsed(receivedAt);
  if (received === null) return 'OFFLINE';

  const transportAge = now - received;
  if (!Number.isFinite(transportAge) || transportAge > BFDB_OFFLINE_AFTER_MS) return 'OFFLINE';

  // A future receive time means the runtime/server clock itself is inconsistent.
  if (transportAge < -TELEMETRY_CLOCK_SKEW_TOLERANCE_MS) return 'CLOCK SKEW';

  const observed = parsed(sourceObservedAt);
  if (
    observed !== null &&
    Math.abs(observed - received) > TELEMETRY_CLOCK_SKEW_TOLERANCE_MS
  ) {
    return 'CLOCK SKEW';
  }

  if (transportAge > BFDB_LIVE_MAX_AGE_MS) return 'STALE';
  return 'LIVE';
}

/**
 * Last-known measurements remain inspectable through the STALE window.
 * OFFLINE samples are retained in history, but no longer projected as current values.
 */
export function isTelemetryTransportCurrent(receivedAt: string, now = Date.now()): boolean {
  const received = parsed(receivedAt);
  if (received === null) return false;
  const age = now - received;
  return (
    Number.isFinite(age) &&
    age >= -TELEMETRY_CLOCK_SKEW_TOLERANCE_MS &&
    age <= BFDB_OFFLINE_AFTER_MS
  );
}
