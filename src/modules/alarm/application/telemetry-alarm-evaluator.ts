import { randomUUID } from 'node:crypto';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type { AlarmEvidenceRef, AlarmSeverity } from '@/modules/alarm/domain/entities';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

type RuleCode = 'LOW_VOLTAGE' | 'OVERCURRENT' | 'POWER_LOSS';
type Counter = { assert: number; clear: number };

function metric(sample: TelemetrySample, key: string): number | null {
  const raw = sample.reported[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as { value?: unknown }).value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function evidence(
  sample: TelemetrySample,
  metricName: string,
  value: number,
  unit: string,
  policy?: { id: string; assertThreshold: number; clearThreshold: number },
): AlarmEvidenceRef {
  return {
    id: randomUUID(),
    kind: 'MQTT',
    sourceIdentity: sample.sourceIdentity,
    ...(sample.sourcePointId ? { sourcePointId: sample.sourcePointId } : {}),
    metric: metricName,
    value,
    unit,
    ...(policy ? { policyId: policy.id, assertThreshold: policy.assertThreshold, clearThreshold: policy.clearThreshold, thresholdUnit: unit } : {}),
    observedAt: sample.sourceObservedAt ?? sample.receivedAt,
  };
}

function matchesSource(policy: AlarmPolicy, sample: TelemetrySample): boolean {
  return !policy.sourceIdentity || policy.sourceIdentity === sample.sourceIdentity;
}

export class TelemetryAlarmEvaluator {
  private readonly commands: AlarmCommandService;
  private readonly counters = new Map<string, Counter>();
  private readonly lastSeen = new Map<string, string>();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly alarms: AlarmRepository,
    private readonly policies: AlarmPolicyRepository,
    topology: TopologyRepository,
  ) {
    this.commands = new AlarmCommandService(alarms, topology);
  }

  start(): void {
    if (this.watchdog || this.stopped) return;
    this.watchdog = setInterval(() => {
      void this.evaluateFreshness().catch(() => {
        // Alarm persistence failures must not crash the telemetry runtime.
        // The next watchdog pass retries the evaluation.
      });
    }, 5_000);
    this.watchdog.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  async observe(sample: TelemetrySample): Promise<void> {
    if (sample.targetType !== 'DEVICE' && sample.targetType !== 'EQUIPMENT') return;
    const policies = await this.policies.listEnabledForTarget(sample.targetType, sample.targetId);
    if (!policies.length) return;

    for (const policy of policies) {
      if (!matchesSource(policy, sample)) continue;
      const seenKey = this.policyKey(policy);
      this.lastSeen.set(seenKey, sample.receivedAt);
      await this.recoverTelemetryLoss(policy, sample);
      await this.evaluateElectrical(policy, sample);
    }
  }

  private async recoverTelemetryLoss(policy: AlarmPolicy, sample: TelemetrySample): Promise<void> {
    if (!policy.telemetryLoss) return;
    const correlationKey = this.correlationKey(policy, 'TELEMETRY_LOSS');
    const active = await this.alarms.getActiveByCorrelationKey(correlationKey);
    if (!active) {
      this.counter(policy, 'TELEMETRY_LOSS').clear = 0;
      return;
    }

    const counter = this.counter(policy, 'TELEMETRY_LOSS');
    counter.clear += 1;
    if (counter.clear < policy.telemetryLoss.recoverySamples) return;
    await this.commands.resolve(
      correlationKey,
      'TELEMETRY_RECOVERY_SAMPLES_SATISFIED',
      [],
      sample.receivedAt,
    );
    counter.clear = 0;
    counter.assert = 0;
  }

  private async evaluateFreshness(): Promise<void> {
    const now = Date.now();
    const policies = await this.policies.listEnabled();
    for (const policy of policies) {
      if (!policy.telemetryLoss) continue;
      const lastSeen = this.lastSeen.get(this.policyKey(policy));
      if (!lastSeen) continue;
      const age = now - Date.parse(lastSeen);
      if (!Number.isFinite(age) || age <= policy.telemetryLoss.lossAfterMs) continue;

      const correlationKey = this.correlationKey(policy, 'TELEMETRY_LOSS');
      if (await this.alarms.getActiveByCorrelationKey(correlationKey)) continue;
      await this.commands.assert({
        code: 'TELEMETRY_LOSS',
        targetType: policy.targetType,
        targetId: policy.targetId,
        sourceContext: policy.sourceContext,
        ...(policy.telemetryLoss.severity ? { severity: policy.telemetryLoss.severity } : {}),
        evidence: [
          {
            id: randomUUID(),
            kind: 'WATCHDOG',
            ...(policy.sourceIdentity ? { sourceIdentity: policy.sourceIdentity } : {}),
            metric: 'telemetry_age_ms',
            value: age,
            unit: 'ms',
            observedAt: new Date(now).toISOString(),
            note: 'No accepted observation within commissioned lossAfterMs.',
          },
        ],
        observedAt: new Date(now).toISOString(),
      });
    }
  }

  private async evaluateElectrical(policy: AlarmPolicy, sample: TelemetrySample): Promise<void> {
    const voltageV = metric(sample, 'voltageV');
    const currentA = metric(sample, 'currentA');

    if (policy.lowVoltage && voltageV !== null) {
      await this.evaluateBooleanRule(
        policy,
        sample,
        'LOW_VOLTAGE',
        voltageV <= policy.lowVoltage.assertBelowV,
        voltageV >= policy.lowVoltage.clearAboveV,
        policy.lowVoltage.debounceSamples,
        policy.lowVoltage.recoverySamples,
        policy.lowVoltage.severity,
        [evidence(sample, 'VOLTAGE', voltageV, 'V', { id: policy.id, assertThreshold: policy.lowVoltage.assertBelowV, clearThreshold: policy.lowVoltage.clearAboveV })],
      );
    }

    if (policy.overcurrent && currentA !== null) {
      await this.evaluateBooleanRule(
        policy,
        sample,
        'OVERCURRENT',
        currentA >= policy.overcurrent.assertAboveA,
        currentA <= policy.overcurrent.clearBelowA,
        policy.overcurrent.debounceSamples,
        policy.overcurrent.recoverySamples,
        policy.overcurrent.severity,
        [evidence(sample, 'CURRENT', currentA, 'A', { id: policy.id, assertThreshold: policy.overcurrent.assertAboveA, clearThreshold: policy.overcurrent.clearBelowA })],
      );
    }

    if (policy.powerLoss && voltageV !== null && currentA !== null) {
      await this.evaluateBooleanRule(
        policy,
        sample,
        'POWER_LOSS',
        voltageV <= policy.powerLoss.assertVoltageBelowV &&
          currentA <= policy.powerLoss.assertCurrentBelowA,
        voltageV >= policy.powerLoss.clearVoltageAboveV,
        policy.powerLoss.debounceSamples,
        policy.powerLoss.recoverySamples,
        policy.powerLoss.severity,
        [evidence(sample, 'VOLTAGE', voltageV, 'V'), evidence(sample, 'CURRENT', currentA, 'A')],
        'SUSPECTED',
      );
    }
  }

  private async evaluateBooleanRule(
    policy: AlarmPolicy,
    sample: TelemetrySample,
    code: RuleCode,
    shouldAssert: boolean,
    shouldClear: boolean,
    debounceSamples: number,
    recoverySamples: number,
    severity: AlarmSeverity | undefined,
    evidenceRefs: readonly AlarmEvidenceRef[],
    confidence?: 'SUSPECTED',
  ): Promise<void> {
    const counter = this.counter(policy, code);
    const correlationKey = this.correlationKey(policy, code);
    const active = await this.alarms.getActiveByCorrelationKey(correlationKey);

    if (shouldAssert) {
      counter.assert += 1;
      counter.clear = 0;
      if (counter.assert >= Math.max(1, debounceSamples)) {
        await this.commands.assert({
          code,
          targetType: policy.targetType,
          targetId: policy.targetId,
          sourceContext: policy.sourceContext,
          evidence: evidenceRefs,
          observedAt: sample.receivedAt,
          ...(severity ? { severity } : {}),
          ...(confidence ? { confidence } : {}),
        });
      }
      return;
    }

    counter.assert = 0;
    if (!active || !shouldClear) {
      counter.clear = 0;
      return;
    }

    counter.clear += 1;
    if (counter.clear < Math.max(1, recoverySamples)) return;
    await this.commands.resolve(
      correlationKey,
      'RECOVERY_POLICY_SATISFIED',
      evidenceRefs.map((item) => item.id),
      sample.receivedAt,
      evidenceRefs,
    );
    counter.clear = 0;
  }

  private policyKey(policy: AlarmPolicy): string {
    return policy.id;
  }

  private correlationKey(policy: AlarmPolicy, code: string): string {
    return [policy.targetId, code, policy.sourceContext].join('|');
  }

  private counter(policy: AlarmPolicy, code: string): Counter {
    const key = policy.id + '|' + code;
    const current = this.counters.get(key) ?? { assert: 0, clear: 0 };
    this.counters.set(key, current);
    return current;
  }
}
