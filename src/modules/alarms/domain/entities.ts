export type AlarmSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlarmState = 'ACTIVE' | 'RESOLVED';
export type AlarmConfidence = 'SUSPECTED' | 'CONFIRMED';
export type AlarmAcknowledgement = 'UNACKNOWLEDGED' | 'ACKNOWLEDGED';

export interface AlarmPathSegment {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly href: string;
}

export interface AlarmOccurrenceView {
  readonly id: string;
  readonly code: string;
  readonly family: 'COMMUNICATION' | 'ELECTRICAL' | 'EQUIPMENT' | 'CORRELATED';
  readonly severity: AlarmSeverity;
  readonly state: AlarmState;
  readonly confidence?: AlarmConfidence;
  readonly acknowledgement: AlarmAcknowledgement;
  readonly targetId: string;
  readonly targetName: string;
  readonly targetHref: string;
  readonly openedAt: string;
  readonly summary: string;
  readonly remarks: string;
  readonly path: readonly AlarmPathSegment[];
  readonly preview: boolean;
}

export interface AlarmRollup {
  readonly directCount: number;
  readonly descendantCount: number;
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly unacknowledged: number;
  readonly highestSeverity: AlarmSeverity | null;
  readonly occurrenceIds: readonly string[];
  readonly affectedChildIds: readonly string[];
}

export interface AlarmSnapshotView {
  readonly preview: boolean;
  readonly occurrences: readonly AlarmOccurrenceView[];
  readonly rollups: Readonly<Record<string, AlarmRollup>>;
}

export const EMPTY_ALARM_ROLLUP: AlarmRollup = {
  directCount: 0,
  descendantCount: 0,
  critical: 0,
  warning: 0,
  info: 0,
  unacknowledged: 0,
  highestSeverity: null,
  occurrenceIds: [],
  affectedChildIds: [],
};

export function severityRank(severity: AlarmSeverity): number {
  return severity === 'CRITICAL' ? 3 : severity === 'WARNING' ? 2 : 1;
}
