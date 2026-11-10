import type { TelemetryWatchRepository } from '@/modules/telemetry/application/telemetry-watch-repository';
import type {
  TelemetryWatchExpectation,
  TelemetryWatchObservation,
  TelemetryWatchState,
} from '@/modules/telemetry/domain/telemetry-watch';
import { telemetryWatchId } from '@/modules/telemetry/domain/telemetry-watch';

export class MemoryTelemetryWatchRepository implements TelemetryWatchRepository {
  private readonly states = new Map<string, TelemetryWatchState>();

  async ensureExpected(
    expectation: TelemetryWatchExpectation,
    firstExpectedAt = new Date().toISOString(),
  ): Promise<TelemetryWatchState> {
    const id = telemetryWatchId(expectation);
    const current = this.states.get(id);
    if (current) return structuredClone(current);
    const state: TelemetryWatchState = {
      id,
      ...expectation,
      firstExpectedAt,
      freshStreak: 0,
      reportedOfflineStreak: 0,
      createdAt: firstExpectedAt,
      updatedAt: firstExpectedAt,
    };
    this.states.set(id, state);
    return structuredClone(state);
  }

  async observe(observation: TelemetryWatchObservation): Promise<TelemetryWatchState> {
    const current = await this.ensureExpected(observation, observation.observedAt);
    if (current.lastObservedAt && observation.observedAt <= current.lastObservedAt) return current;

    const next: TelemetryWatchState = {
      ...current,
      lastObservedAt: observation.observedAt,
      ...(observation.usable ? { lastUsableAt: observation.observedAt } : {}),
      ...(observation.reportedState ? { lastReportedState: observation.reportedState } : {}),
      freshStreak: observation.usable ? current.freshStreak + 1 : 0,
      reportedOfflineStreak: observation.usable ? 0 : current.reportedOfflineStreak + 1,
      updatedAt: observation.observedAt,
    };
    this.states.set(next.id, next);
    return structuredClone(next);
  }

  async list(): Promise<readonly TelemetryWatchState[]> {
    return [...this.states.values()].map((item) => structuredClone(item));
  }
}
