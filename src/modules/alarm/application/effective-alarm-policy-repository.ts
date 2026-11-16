import { createHash } from 'node:crypto';
import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';
import { resolveRules, type ManagedAlarmRule } from '@/modules/alarm/domain/rule-manager';
import type { RuleManagerStore } from '@/modules/alarm/infrastructure/rule-manager-store';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

export interface EffectiveRule {
  readonly code: string;
  readonly source: 'MANAGED' | 'LEGACY';
  readonly scope: string;
  readonly ruleId: string;
  readonly rule: ManagedAlarmRule | null;
}

const POLICY_FIELDS: Readonly<Record<string, keyof AlarmPolicy>> = {
  LOW_VOLTAGE:'lowVoltage', HIGH_VOLTAGE:'highVoltage', VOLTAGE_LOSS:'voltageLoss',
  LOW_CURRENT:'lowCurrent', LOAD_LOSS:'loadLoss', SUDDEN_CURRENT_DROP:'suddenCurrentDrop',
  LOW_POWER:'lowPower', HIGH_POWER:'highPower',
  NO_ENERGY_INCREMENT:'noEnergyIncrement', ENERGY_COUNTER_RESET:'energyCounterReset',
  ENERGY_CONSUMPTION_ANOMALY:'energyConsumptionAnomaly',
};

function assignedRuleFields(rule: ManagedAlarmRule): Record<string, unknown> {
  return {
    ...rule.parameters,
    debounceSamples: rule.debounceSamples,
    recoverySamples: rule.recoverySamples,
    severity: rule.severity,
  };
}

/**
 * Read-through adapter. The existing alarm_policies collection is NEVER rewritten.
 * Published rules are applied only to commissioned breaker points with one unambiguous
 * MQTT source. Existing legacy policies win for the same alarm code.
 */
export class EffectiveAlarmPolicyRepository implements AlarmPolicyRepository {
  constructor(
    private readonly legacy: AlarmPolicyRepository,
    private readonly managed: RuleManagerStore,
    private readonly topology: TopologyRepository,
    private readonly bindings: TelemetryBindingRepository,
  ) {}

  async listEnabled(): Promise<readonly AlarmPolicy[]> {
    return this.legacy.listEnabled();
  }
  async getById(id: string): Promise<AlarmPolicy | null> {
    return this.legacy.getById(id);
  }

  private async eligible(targetType: AlarmPolicy['targetType'], targetId: string) {
    if (targetType !== 'EQUIPMENT') return null;
    const breaker = await this.topology.getById(targetId);
    if (!breaker || breaker.lifecycle !== 'ACTIVE' || breaker.kind !== 'EQUIPMENT' ||
      breaker.equipmentType !== 'CIRCUIT_BREAKER') return null;

    const panelIds: string[] = [];
    const qdfIds: string[] = [];
    const visited = new Set<string>();
    let current = await this.topology.getById(breaker.parentId);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.kind === 'DEVICE') qdfIds.push(current.id);
      if (current.kind === 'EQUIPMENT' && current.equipmentType === 'PANEL')
        panelIds.push(current.id);
      current = current.parentId ? await this.topology.getById(current.parentId) : null;
    }
    const activeBindings = (await this.bindings.listForTarget('EQUIPMENT', targetId)).filter(
      (b) => b.lifecycle === 'ACTIVE' && b.protocol === 'MQTT' && b.sourcePointId &&
        ['VOLTAGE','CURRENT','POWER','ENERGY'].includes(b.metric.toUpperCase()),
    );
    if (!activeBindings.length) return null;
    const sources = new Map<string, Set<string>>();
    for (const binding of activeBindings) {
      const metrics = sources.get(binding.sourceIdentity) ?? new Set<string>();
      metrics.add(binding.metric.toUpperCase());
      sources.set(binding.sourceIdentity,metrics);
    }
    return {
      sources,
      scope: { breakerId:targetId, qdfIds, panelIds },
    };
  }

  async effectiveRuleSnapshot(targetId: string): Promise<readonly EffectiveRule[]> {
    const policies = await this.legacy.listEnabledForTarget('EQUIPMENT',targetId);
    const eligible = await this.eligible('EQUIPMENT',targetId);
    if (!eligible) return [];
    const managed = resolveRules(
      (await this.managed.list()).flatMap((r) => r.published ? [r.published] : []),
      eligible.scope,
    );
    const result: EffectiveRule[] = [];
    for (const code of Object.keys(POLICY_FIELDS)) {
      const field = POLICY_FIELDS[code]!;
      const existing = policies.find((p)=>Boolean(p[field]));
      if (existing) {
        result.push({code,source:'LEGACY',scope:'BREAKER',ruleId:existing.id,rule:null});
        continue;
      }
      const configured = managed.find((r)=>r.code===code);
      if (configured) {
        const metric = code.includes('VOLTAGE') ? 'VOLTAGE'
          : code.includes('CURRENT') || code === 'LOAD_LOSS' ? 'CURRENT'
          : code.includes('POWER') ? 'POWER' : 'ENERGY';
        if ([...eligible.sources.values()].some((m)=>m.has(metric)))
          result.push({code,source:'MANAGED',scope:configured.scope,ruleId:configured.id,rule:configured});
      }
    }
    return result;
  }

  async listEnabledForTarget(
    targetType: AlarmPolicy['targetType'],
    targetId: string,
  ): Promise<readonly AlarmPolicy[]> {
    const existing = await this.legacy.listEnabledForTarget(targetType,targetId);
    const context = await this.eligible(targetType,targetId);
    if (!context) return existing;
    const rules = resolveRules(
      (await this.managed.list()).flatMap((record) => record.published ? [record.published] : []),
      context.scope,
    );
    const managed: AlarmPolicy[] = [];
    for (const [sourceIdentity,availableMetrics] of context.sources) {
      const additions: Record<string,unknown> = {};
      for (const rule of rules) {
        const field = POLICY_FIELDS[rule.code];
        if (!field || existing.some((policy)=>Boolean(policy[field]))) continue;
        const metric = rule.code.includes('VOLTAGE') ? 'VOLTAGE'
          : rule.code.includes('CURRENT') || rule.code === 'LOAD_LOSS' ? 'CURRENT'
          : rule.code.includes('POWER') ? 'POWER' : 'ENERGY';
        if (!availableMetrics.has(metric)) continue;
        additions[field] = assignedRuleFields(rule);
      }
      if (!Object.keys(additions).length) continue;
      const at = new Date().toISOString();
      const key = createHash('sha256').update(sourceIdentity).digest('hex').slice(0,12);
      managed.push({
        id:'managed:' + targetId + ':' + key,
        targetType:'EQUIPMENT',
        targetId,
        sourceContext:'managed:' + targetId + ':' + key,
        sourceIdentity,
        enabled:true,
        createdAt:at,
        updatedAt:at,
        ...additions,
      } as AlarmPolicy);
    }
    return [...existing,...managed];
  }
}
