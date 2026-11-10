export type TelemetryWatchScope = 'SOURCE' | 'POINT';

export interface TelemetryWatchState {
  readonly id: string;
  readonly protocol: string;
  readonly sourceIdentity: string;
  readonly scope: TelemetryWatchScope;
  readonly targetType: 'DEVICE' | 'EQUIPMENT';
  readonly targetId: string;
  readonly sourcePointId?: string;
  readonly firstExpectedAt: string;
  readonly lastObservedAt?: string;
  readonly lastUsableAt?: string;
  readonly lastReportedState?: string;
  readonly freshStreak: number;
  readonly reportedOfflineStreak: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TelemetryWatchExpectation {
  readonly protocol: string;
  readonly sourceIdentity: string;
  readonly scope: TelemetryWatchScope;
  readonly targetType: 'DEVICE' | 'EQUIPMENT';
  readonly targetId: string;
  readonly sourcePointId?: string;
}

export interface TelemetryWatchObservation extends TelemetryWatchExpectation {
  readonly observedAt: string;
  readonly usable: boolean;
  readonly reportedState?: string;
}

export function telemetryWatchId(value: TelemetryWatchExpectation): string {
  return [
    'telemetry-watch',
    value.protocol.toLowerCase(),
    value.sourceIdentity,
    value.scope.toLowerCase(),
    value.targetId,
    value.sourcePointId ?? '-',
  ].join(':');
}
