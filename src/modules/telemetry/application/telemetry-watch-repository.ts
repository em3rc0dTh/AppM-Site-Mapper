import type {
  TelemetryWatchExpectation,
  TelemetryWatchObservation,
  TelemetryWatchState,
} from '@/modules/telemetry/domain/telemetry-watch';

export interface TelemetryWatchRepository {
  ensureExpected(
    expectation: TelemetryWatchExpectation,
    firstExpectedAt?: string,
  ): Promise<TelemetryWatchState>;
  observe(observation: TelemetryWatchObservation): Promise<TelemetryWatchState>;
  list(): Promise<readonly TelemetryWatchState[]>;
}
