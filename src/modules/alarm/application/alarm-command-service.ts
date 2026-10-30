import { randomUUID } from 'node:crypto';

import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import { alarmDefinition } from '@/modules/alarm/domain/catalog';
import type {
  AlarmConfidence,
  AlarmEvidenceRef,
  AlarmOccurrence,
  AlarmSeverity,
} from '@/modules/alarm/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

export interface AssertAlarmInput {
  readonly code: string;
  readonly targetType: 'DEVICE' | 'EQUIPMENT';
  readonly targetId: string;
  readonly sourceContext: string;
  readonly evidence: readonly AlarmEvidenceRef[];
  readonly observedAt?: string;
  readonly severity?: AlarmSeverity;
  readonly confidence?: AlarmConfidence;
}

export class AlarmCommandService {
  constructor(
    private readonly alarms: AlarmRepository,
    private readonly topology: TopologyRepository,
  ) {}

  async assert(input: AssertAlarmInput): Promise<AlarmOccurrence> {
    const definition = alarmDefinition(input.code);
    if (!definition?.enabled) throw new Error('ALARM_DEFINITION_DISABLED');
    if (!definition.applicableTargetTypes.includes(input.targetType)) {
      throw new Error('ALARM_TARGET_TYPE_NOT_ALLOWED');
    }
    const target = await this.topology.getById(input.targetId);
    if (!target || target.lifecycle !== 'ACTIVE' || target.kind !== input.targetType) {
      throw new Error('ALARM_TARGET_NOT_ACTIVE');
    }

    const correlationKey = [input.targetId, input.code, input.sourceContext].join('|');
    const existing = await this.alarms.getActiveByCorrelationKey(correlationKey);
    const observedAt = input.observedAt ?? new Date().toISOString();

    if (existing) {
      const evidenceById = new Map(existing.evidenceRefs.map((item) => [item.id, item]));
      for (const item of input.evidence) evidenceById.set(item.id, item);
      const next: AlarmOccurrence = {
        ...existing,
        lastObservedAt: observedAt,
        severity: input.severity ?? existing.severity,
        // Once independently corroborated, an active occurrence cannot be downgraded
        // by a later MQTT-only observation. Resolution is a separate transition.
        ...(input.confidence
          ? {
              confidence:
                existing.confidence === 'CONFIRMED' ? 'CONFIRMED' : input.confidence,
            }
          : {}),
        evidenceRefs: [...evidenceById.values()],
        updatedAt: observedAt,
      };
      await this.alarms.replaceOccurrence(next);
      return next;
    }

    const occurrence: AlarmOccurrence = {
      id: randomUUID(),
      alarmCode: definition.code,
      family: definition.family,
      name: definition.name,
      targetType: input.targetType,
      targetId: input.targetId,
      sourceContext: input.sourceContext,
      openedAt: observedAt,
      lastObservedAt: observedAt,
      lifecycle: 'ACTIVE',
      severity: input.severity ?? definition.defaultSeverity,
      ...(input.confidence ? { confidence: input.confidence } : {}),
      acknowledgement: 'UNACKNOWLEDGED',
      correlationKey,
      ruleVersion: definition.ruleVersion,
      evidenceRefs: [...input.evidence],
      createdAt: observedAt,
      updatedAt: observedAt,
    };
    await this.alarms.insertOccurrence(occurrence);
    await this.alarms.insertTransition({
      id: randomUUID(),
      alarmOccurrenceId: occurrence.id,
      fromState: 'CLEAR',
      toState: 'ACTIVE',
      occurredAt: observedAt,
      reason: 'CONDITION_ASSERTED',
      evidenceRefs: input.evidence.map((item) => item.id),
    });
    return occurrence;
  }

  async resolve(
    correlationKey: string,
    reason: string,
    evidenceRefs: readonly string[] = [],
    observedAt = new Date().toISOString(),
  ): Promise<AlarmOccurrence | null> {
    const existing = await this.alarms.getActiveByCorrelationKey(correlationKey);
    if (!existing) return null;
    const next: AlarmOccurrence = {
      ...existing,
      lifecycle: 'RESOLVED',
      resolvedAt: observedAt,
      lastObservedAt: observedAt,
      updatedAt: observedAt,
    };
    await this.alarms.replaceOccurrence(next);
    await this.alarms.insertTransition({
      id: randomUUID(),
      alarmOccurrenceId: existing.id,
      fromState: 'ACTIVE',
      toState: 'RESOLVED',
      occurredAt: observedAt,
      reason,
      evidenceRefs: [...evidenceRefs],
    });
    return next;
  }
}
