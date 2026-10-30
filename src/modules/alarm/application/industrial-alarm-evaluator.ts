import { randomUUID } from 'node:crypto';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import { alarmDefinition } from '@/modules/alarm/domain/catalog';
import type { AlarmEvidenceRef, AlarmSeverity } from '@/modules/alarm/domain/entities';
import type { ObservationBatch, Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

function commissionedSeverity(value: string | null): AlarmSeverity | undefined {
  return value === 'INFO' || value === 'WARNING' || value === 'CRITICAL' ? value : undefined;
}

function evidenceFor(signal: Signal): AlarmEvidenceRef {
  return {
    id: randomUUID(),
    kind: 'SNMP',
    sourceIdentity: signal.sourceIdentity,
    sourcePointId: signal.key,
    metric: signal.alarmCode ?? 'HARDWARE_ALARM',
    value: signal.alarmState ?? signal.value ?? String(signal.rawValue ?? ''),
    observedAt: signal.observedAt,
    note:
      signal.interpretationEvidence ??
      `Commissioned SNMP profile ${signal.profileVersion}; normalized alarm evidence.`,
  };
}

/**
 * Converts only explicitly commissioned SNMP alarm signals into Alarm Engine evidence.
 *
 * Raw OIDs, MIB enums and unknown/derived signals do not open application alarms by
 * themselves. A profile must opt in with alarmCode and/or corroboratesAlarmCodes.
 */
export class IndustrialAlarmEvaluator {
  private readonly commands: AlarmCommandService;

  constructor(
    private readonly alarms: AlarmRepository,
    private readonly topology: TopologyRepository,
  ) {
    this.commands = new AlarmCommandService(alarms, topology);
  }

  async observe(batch: ObservationBatch): Promise<void> {
    for (const signal of batch.signals) {
      if (
        signal.protocol !== 'SNMP' ||
        signal.kind !== 'alarm' ||
        signal.interpretation !== 'PROFILE' ||
        !signal.targetId ||
        (signal.alarmState !== 'ACTIVE' && signal.alarmState !== 'RESOLVED')
      ) {
        continue;
      }

      const target = await this.topology.getById(signal.targetId);
      if (
        !target ||
        target.lifecycle !== 'ACTIVE' ||
        (target.kind !== 'DEVICE' && target.kind !== 'EQUIPMENT')
      ) {
        continue;
      }

      const evidence = evidenceFor(signal);
      const targetType = target.kind;

      if (signal.alarmCode) {
        const definition = alarmDefinition(signal.alarmCode);
        if (definition?.enabled && definition.applicableTargetTypes.includes(targetType)) {
          const sourceContext = `snmp:${signal.sourceIdentity}:${signal.key}`;
          const correlationKey = [signal.targetId, signal.alarmCode, sourceContext].join('|');

          if (signal.alarmState === 'ACTIVE') {
            const severity = commissionedSeverity(signal.severity);
            await this.commands.assert({
              code: signal.alarmCode,
              targetType,
              targetId: signal.targetId,
              sourceContext,
              evidence: [evidence],
              observedAt: signal.observedAt,
              ...(severity ? { severity } : {}),
            });
          } else {
            const active = await this.alarms.getActiveByCorrelationKey(correlationKey);
            if (active) {
              const byId = new Map(active.evidenceRefs.map((item) => [item.id, item]));
              byId.set(evidence.id, evidence);
              await this.alarms.replaceOccurrence({
                ...active,
                lastObservedAt: signal.observedAt,
                evidenceRefs: [...byId.values()],
                updatedAt: signal.observedAt,
              });
              await this.commands.resolve(
                correlationKey,
                'SNMP_EXPLICIT_CLEAR',
                [evidence.id],
                signal.observedAt,
              );
            }
          }
        }
      }

      if (signal.alarmState !== 'ACTIVE' || !signal.corroboratesAlarmCodes?.length) continue;

      const active = await this.alarms.listActive();
      for (const code of new Set(signal.corroboratesAlarmCodes)) {
        const definition = alarmDefinition(code);
        if (!definition?.enabled || definition.family !== 'CORRELATED') continue;

        for (const occurrence of active) {
          if (
            occurrence.targetId !== signal.targetId ||
            occurrence.targetType !== targetType ||
            occurrence.alarmCode !== code
          ) {
            continue;
          }
          await this.commands.assert({
            code,
            targetType,
            targetId: signal.targetId,
            sourceContext: occurrence.sourceContext,
            evidence: [evidence],
            observedAt: signal.observedAt,
            severity: occurrence.severity,
            confidence: 'CONFIRMED',
          });
        }
      }
    }
  }
}
