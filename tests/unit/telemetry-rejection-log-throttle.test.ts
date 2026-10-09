import { describe, expect, it } from 'vitest';

import { TelemetryRejectionLogThrottle } from '@/modules/telemetry/infrastructure/telemetry-rejection-log-throttle';

describe('TelemetryRejectionLogThrottle', () => {
  it('logs the first rejection and suppresses repeats inside the interval', () => {
    const throttle = new TelemetryRejectionLogThrottle(60_000);

    expect(throttle.record('topic-a\u0000UNKNOWN_SOURCE', 1_000)).toEqual({
      shouldLog: true,
      suppressedSinceLastLog: 0,
    });
    expect(throttle.record('topic-a\u0000UNKNOWN_SOURCE', 2_000)).toEqual({
      shouldLog: false,
      suppressedSinceLastLog: 1,
    });
    expect(throttle.record('topic-a\u0000UNKNOWN_SOURCE', 3_000)).toEqual({
      shouldLog: false,
      suppressedSinceLastLog: 2,
    });
  });

  it('emits a summary after the interval and resets the suppressed counter', () => {
    const throttle = new TelemetryRejectionLogThrottle(60_000);

    throttle.record('topic-a\u0000UNKNOWN_SOURCE', 1_000);
    throttle.record('topic-a\u0000UNKNOWN_SOURCE', 2_000);
    throttle.record('topic-a\u0000UNKNOWN_SOURCE', 3_000);

    expect(throttle.record('topic-a\u0000UNKNOWN_SOURCE', 61_000)).toEqual({
      shouldLog: true,
      suppressedSinceLastLog: 2,
    });
    expect(throttle.record('topic-a\u0000UNKNOWN_SOURCE', 62_000)).toEqual({
      shouldLog: false,
      suppressedSinceLastLog: 1,
    });
  });

  it('tracks each topic and reason independently', () => {
    const throttle = new TelemetryRejectionLogThrottle(60_000);

    expect(throttle.record('topic-a\u0000UNKNOWN_SOURCE', 1_000).shouldLog).toBe(true);
    expect(throttle.record('topic-b\u0000UNKNOWN_SOURCE', 1_001).shouldLog).toBe(true);
    expect(throttle.record('topic-a\u0000INVALID_BINDING_TARGET', 1_002).shouldLog).toBe(true);
  });

  it('rejects invalid throttle intervals', () => {
    expect(() => new TelemetryRejectionLogThrottle(0)).toThrow('INVALID_REJECTION_LOG_INTERVAL');
  });
});
