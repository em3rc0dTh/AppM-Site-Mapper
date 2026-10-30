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

function isCorrelationConflict(error: unknown): boolean {
  if (error instanceof Error && error.message === 'ALARM_ACTIVE_CORRELATION_EXISTS') return true;
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function isStaleWrite(error: unknown): boolean {
  return error instanceof Error && error.message === 'ALARM_STALE_WRITE';
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
    const observedAt = input.observedAt ?? new Date().toISOString();
    const existing = await this.alarms.getActiveByCorrelationKey(correlationKey);
    if (existing) return this.mergeActive(existing, input, observedAt);

    const latest = await this.alarms.getLatestByCorrelationKey(correlationKey);
    if (latest?.lifecycle === 'RESOLVED' && observedAt <= latest.lastObservedAt) {
      return latest;
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

    try {
      await this.alarms.insertOccurrence(occurrence);
    } catch (error) {
      if (!isCorrelationConflict(error)) throw error;
      const winner = await this.alarms.getActiveByCorrelationKey(correlationKey);
      if (!winner) throw error;
      return this.mergeActive(winner, input, observedAt);
    }

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
    if (observedAt < existing.lastObservedAt) return existing;

    const next: AlarmOccurrence = {
      ...existing,
      lifecycle: 'RESOLVED',
      resolvedAt: observedAt,
      lastObservedAt: observedAt,
      updatedAt: observedAt,
    };

    try {
      await this.alarms.replaceOccurrence(next);
    } catch (error) {
      if (!isStaleWrite(error)) throw error;
      return this.alarms.getLatestByCorrelationKey(correlationKey);
    }

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

  private async mergeActive(
    existing: AlarmOccurrence,
    input: AssertAlarmInput,
    observedAt: string,
  ): Promise<AlarmOccurrence> {
    if (observedAt < existing.lastObservedAt) return existing;

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
            confidence: existing.confidence === 'CONFIRMED' ? 'CONFIRMED' : input.confidence,
          }
        : {}),
      evidenceRefs: [...evidenceById.values()],
      updatedAt: observedAt,
    };

    try {
      await this.alarms.replaceOccurrence(next);
      return next;
    } catch (error) {
      if (!isStaleWrite(error)) throw error;
      return (await this.alarms.getLatestByCorrelationKey(existing.correlationKey)) ?? existing;
    }
  }
}
