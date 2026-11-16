export interface TelemetryRejectionLogDecision {
  readonly shouldLog: boolean;
  readonly suppressedSinceLastLog: number;
}

interface TelemetryRejectionLogState {
  lastLoggedAt: number;
  suppressed: number;
}

export class TelemetryRejectionLogThrottle {
  private readonly states = new Map<string, TelemetryRejectionLogState>();

  constructor(private readonly intervalMs: number) {
    if (!Number.isInteger(intervalMs) || intervalMs < 1) {
      throw new Error('INVALID_REJECTION_LOG_INTERVAL');
    }
  }

  record(key: string, nowMs = Date.now()): TelemetryRejectionLogDecision {
    const state = this.states.get(key);

    if (!state) {
      this.states.set(key, { lastLoggedAt: nowMs, suppressed: 0 });
      return { shouldLog: true, suppressedSinceLastLog: 0 };
    }

    if (nowMs - state.lastLoggedAt >= this.intervalMs) {
      const suppressedSinceLastLog = state.suppressed;
      this.states.set(key, { lastLoggedAt: nowMs, suppressed: 0 });
      return { shouldLog: true, suppressedSinceLastLog };
    }

    state.suppressed += 1;
    return { shouldLog: false, suppressedSinceLastLog: state.suppressed };
  }
}
