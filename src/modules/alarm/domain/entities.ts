export type AlarmFamily = 'COMMUNICATION' | 'ELECTRICAL' | 'EQUIPMENT' | 'CORRELATED';
export type AlarmSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlarmLifecycle = 'ACTIVE' | 'RESOLVED';
export type AlarmAcknowledgement = 'UNACKNOWLEDGED' | 'ACKNOWLEDGED';
export type AlarmConfidence = 'SUSPECTED' | 'CONFIRMED';

export interface AlarmDefinition {
  readonly code: string;
  readonly family: AlarmFamily;
  readonly name: string;
  readonly description: string;
  readonly applicableTargetTypes: readonly string[];
  readonly defaultSeverity: AlarmSeverity;
  readonly ruleVersion: string;
  readonly enabled: boolean;
}

export interface AlarmEvidenceRef {
  readonly id: string;
  readonly kind: 'MQTT' | 'SNMP' | 'WATCHDOG' | 'DERIVED' | 'OPERATOR';
  readonly sourceIdentity?: string;
  readonly sourcePointId?: string;
  readonly metric?: string;
  readonly value?: number | string | boolean;
  readonly unit?: string;
  readonly assertThreshold?: number;
  readonly clearThreshold?: number;
  readonly thresholdUnit?: string;
  readonly policyId?: string;
  readonly observedAt: string;
  readonly note?: string;
}

export interface AlarmOccurrence {
  readonly id: string;
  readonly alarmCode: string;
  readonly family: AlarmFamily;
  readonly name: string;
  readonly targetType: 'DEVICE' | 'EQUIPMENT';
  readonly targetId: string;
  readonly sourceContext: string;
  readonly openedAt: string;
  readonly lastObservedAt: string;
  readonly resolvedAt?: string;
  readonly lifecycle: AlarmLifecycle;
  readonly severity: AlarmSeverity;
  readonly confidence?: AlarmConfidence;
  readonly acknowledgement: AlarmAcknowledgement;
  readonly acknowledgedAt?: string;
  readonly acknowledgedBy?: string;
  readonly correlationKey: string;
  readonly ruleVersion: string;
  readonly evidenceRefs: readonly AlarmEvidenceRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlarmTransition {
  readonly id: string;
  readonly alarmOccurrenceId: string;
  readonly fromState: string;
  readonly toState: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly evidenceRefs: readonly string[];
  readonly actorId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AlarmPathItem {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly href: string;
}

export interface AlarmOccurrenceView extends AlarmOccurrence {
  readonly path: readonly AlarmPathItem[];
  readonly targetHref: string;
}

export interface AlarmRollup {
  readonly directAlarmIds: readonly string[];
  readonly descendantAlarmIds: readonly string[];
  readonly directActiveAlarmCount: number;
  readonly descendantActiveAlarmCount: number;
  readonly activeAlarmCount: number;
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly unacknowledgedCount: number;
  readonly highestSeverity: AlarmSeverity | null;
  readonly affectedChildren: readonly {
    id: string;
    name: string;
    href: string;
    activeAlarmCount: number;
    highestSeverity: AlarmSeverity;
  }[];
}

export interface AlarmSnapshot {
  readonly occurrences: readonly AlarmOccurrenceView[];
  readonly rollups: Readonly<Record<string, AlarmRollup>>;
  readonly global: AlarmRollup;
}
