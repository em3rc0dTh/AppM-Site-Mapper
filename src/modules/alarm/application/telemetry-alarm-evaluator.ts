import { randomUUID } from 'node:crypto';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import type { AlarmPolicyRepository } from '@/modules/alarm/application/alarm-policy-repository';
import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type { AlarmEvidenceRef, AlarmSeverity } from '@/modules/alarm/domain/entities';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryWatchRepository } from '@/modules/telemetry/application/telemetry-watch-repository';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import {
  BFDB_OFFLINE_AFTER_MS,
  BFDB_EXPECTED_INTERVAL_MS,
} from '@/modules/telemetry/domain/telemetry-freshness';
import {
  telemetryWatchId,
  type TelemetryWatchExpectation,
  type TelemetryWatchState,
} from '@/modules/telemetry/domain/telemetry-watch';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode } from '@/modules/topology/domain/entities';

type RuleCode = 'LOW_VOLTAGE' | 'OVERCURRENT' | 'POWER_LOSS';
type Counter = { assert: number; clear: number };

export interface AutomaticTelemetryAlarmOptions {
  readonly lossAfterMs?: number;
  readonly recoverySamples?: number;
  readonly reportedOfflineSamples?: number;
  readonly onWatchdogError?: (error: unknown) => void;
}

function metric(sample: TelemetrySample, key: string): number | null {
  const raw = sample.reported[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = (raw as { value?: unknown }).value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function reportedState(sample: TelemetrySample): string | null {
  const value = sample.reported.state;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return String(value).trim().toUpperCase() || null;
}

function explicitlyOffline(sample: TelemetrySample): boolean {
  return reportedState(sample) === 'OFFLINE';
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
    ...(policy
      ? {
          policyId: policy.id,
          assertThreshold: policy.assertThreshold,
          clearThreshold: policy.clearThreshold,
          thresholdUnit: unit,
        }
      : {}),
    observedAt: sample.sourceObservedAt ?? sample.receivedAt,
  };
}

function matchesSource(policy: AlarmPolicy, sample: TelemetrySample): boolean {
  return !policy.sourceIdentity || policy.sourceIdentity === sample.sourceIdentity;
}

function safeAge(reference: string | undefined, now: number): number {
  if (!reference) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(reference);
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : Number.POSITIVE_INFINITY;
}

function isPointMetric(metricName: string): boolean {
  return ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'].includes(metricName.toUpperCase());
}

export class TelemetryAlarmEvaluator {
  private readonly commands: AlarmCommandService;
  private readonly counters = new Map<string, Counter>();
  private readonly lastSeen = new Map<string, string>();
  private readonly automaticLossAfterMs: number;
  private readonly automaticRecoverySamples: number;
  private readonly automaticReportedOfflineSamples: number;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly alarms: AlarmRepository,
    private readonly policies: AlarmPolicyRepository,
    private readonly topology: TopologyRepository,
    private readonly bindings?: TelemetryBindingRepository,
    private readonly watches?: TelemetryWatchRepository,
    private readonly options: AutomaticTelemetryAlarmOptions = {},
  ) {
    this.commands = new AlarmCommandService(alarms, topology);
    this.automaticLossAfterMs = options.lossAfterMs ?? BFDB_OFFLINE_AFTER_MS;
    this.automaticRecoverySamples = Math.max(1, options.recoverySamples ?? 2);
    this.automaticReportedOfflineSamples = Math.max(1, options.reportedOfflineSamples ?? 2);
  }

  start(): void {
    if (this.watchdog || this.stopped) return;
    this.watchdog = setInterval(() => {
      void this.evaluateNow().catch((error) => {
        this.options.onWatchdogError?.(error);
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

    if (this.bindings && this.watches) await this.observeAutomaticWatch(sample);

    const policies = await this.policies.listEnabledForTarget(sample.targetType, sample.targetId);
    if (!policies.length) return;

    for (const policy of policies) {
      if (!matchesSource(policy, sample)) continue;

      // Legacy/manual TELEMETRY_LOSS policies remain supported when automatic
      // operational monitoring is not wired. The runtime uses automatic watches.
      if (!this.bindings || !this.watches) {
        const seenKey = this.policyKey(policy);
        this.lastSeen.set(seenKey, sample.receivedAt);
        await this.recoverTelemetryLoss(policy, sample);
      }

      // An explicit downstream OFFLINE state is observability evidence, not an
      // electrical zero. Never assert/clear electrical alarms from those zero fields.
      if (!explicitlyOffline(sample)) await this.evaluateElectrical(policy, sample);
    }
  }

  async evaluateNow(now = Date.now()): Promise<void> {
    if (this.bindings && this.watches) {
      await this.evaluateAutomaticFreshness(now);
      return;
    }
    await this.evaluateLegacyPolicyFreshness(now);
  }

  private async observeAutomaticWatch(sample: TelemetrySample): Promise<void> {
    if (!this.watches || (sample.targetType !== 'DEVICE' && sample.targetType !== 'EQUIPMENT')) return;
    const scope = sample.sourcePointId ? 'POINT' : 'SOURCE';
    const state = reportedState(sample);
    await this.watches.observe({
      protocol: 'MQTT',
      sourceIdentity: sample.sourceIdentity,
      scope,
      targetType: sample.targetType,
      targetId: sample.targetId,
      ...(sample.sourcePointId ? { sourcePointId: sample.sourcePointId } : {}),
      observedAt: sample.receivedAt,
      usable: scope === 'SOURCE' || state !== 'OFFLINE',
      ...(state ? { reportedState: state } : {}),
    });
  }

  private async evaluateAutomaticFreshness(now: number): Promise<void> {
    if (!this.bindings || !this.watches) return;
    const allBindings = await this.bindings.listActiveByProtocol('MQTT');
    const sourceBindings = allBindings.filter(
      (binding) =>
        !binding.sourcePointId &&
        binding.metric.toUpperCase() === 'SOURCE' &&
        (binding.targetType === 'DEVICE' || binding.targetType === 'EQUIPMENT'),
    );
    const pointBindings = allBindings.filter(
      (binding) =>
        Boolean(binding.sourcePointId) &&
        binding.targetType === 'EQUIPMENT' &&
        isPointMetric(binding.metric),
    );

    const expectations = new Map<string, TelemetryWatchExpectation>();
    for (const binding of sourceBindings) {
      const expectation: TelemetryWatchExpectation = {
        protocol: 'MQTT',
        sourceIdentity: binding.sourceIdentity,
        scope: 'SOURCE',
        targetType: binding.targetType as 'DEVICE' | 'EQUIPMENT',
        targetId: binding.targetId,
      };
      expectations.set(telemetryWatchId(expectation), expectation);
    }
    for (const binding of pointBindings) {
      const expectation: TelemetryWatchExpectation = {
        protocol: 'MQTT',
        sourceIdentity: binding.sourceIdentity,
        scope: 'POINT',
        targetType: 'EQUIPMENT',
        targetId: binding.targetId,
        sourcePointId: binding.sourcePointId!,
      };
      expectations.set(telemetryWatchId(expectation), expectation);
    }

    const stateById = new Map((await this.watches.list()).map((state) => [state.id, state]));
    const nowIso = new Date(now).toISOString();
    for (const expectation of expectations.values()) {
      const id = telemetryWatchId(expectation);
      if (!stateById.has(id)) {
        // First deployment/bootstrap gets one complete loss window. Subsequent
        // restarts reuse persisted state and therefore detect an already-lost source.
        stateById.set(id, await this.watches.ensureExpected(expectation, nowIso));
      }
    }

    const sourceEntries = sourceBindings
      .map((binding) => {
        const expectation: TelemetryWatchExpectation = {
          protocol: 'MQTT',
          sourceIdentity: binding.sourceIdentity,
          scope: 'SOURCE',
          targetType: binding.targetType as 'DEVICE' | 'EQUIPMENT',
          targetId: binding.targetId,
        };
        const state = stateById.get(telemetryWatchId(expectation));
        const age = safeAge(state?.lastObservedAt ?? state?.firstExpectedAt, now);
        return { binding, expectation, state, age, offline: age > this.automaticLossAfterMs };
      })
      .filter(
        (entry, index, array) =>
          array.findIndex((candidate) => candidate.binding.sourceIdentity === entry.binding.sourceIdentity) ===
          index,
      );

    const offlineSources = sourceEntries.filter((entry) => entry.offline);
    const correlatedSeverity: AlarmSeverity = offlineSources.length >= 2 ? 'CRITICAL' : 'WARNING';

    for (const source of sourceEntries) {
      const context = this.sourceContext(source.binding.sourceIdentity);
      if (source.offline) {
        await this.watches.markLost(source.expectation, nowIso);
        await this.assertAutomaticLoss({
          targetType: source.expectation.targetType,
          targetId: source.expectation.targetId,
          sourceContext: context,
          sourceIdentity: source.binding.sourceIdentity,
          age: source.age,
          severity: correlatedSeverity,
          note:
            offlineSources.length >= 2
              ? `${offlineSources.length}/${sourceEntries.length} commissioned MQTT sources are offline; probable shared communication impact.`
              : 'Commissioned MQTT source has exceeded the automatic telemetry loss window.',
          nowIso,
        });
        await this.resolveDescendantAutomaticLoss(
          source.binding.sourceIdentity,
          pointBindings,
          nowIso,
          'SUPERSEDED_BY_SOURCE_TELEMETRY_LOSS',
        );
      } else if (
        source.state &&
        source.state.freshStreak >= this.automaticRecoverySamples
      ) {
        await this.resolveAutomaticLoss(
          source.expectation.targetId,
          context,
          nowIso,
          'TELEMETRY_SOURCE_RECOVERED',
        );
      }
    }

    const offlineSourceIds = new Set(offlineSources.map((entry) => entry.binding.sourceIdentity));
    const uniquePoints = new Map<
      string,
      { expectation: TelemetryWatchExpectation; state: TelemetryWatchState; node: EquipmentNode }
    >();

    for (const binding of pointBindings) {
      if (offlineSourceIds.has(binding.sourceIdentity)) continue;
      const expectation: TelemetryWatchExpectation = {
        protocol: 'MQTT',
        sourceIdentity: binding.sourceIdentity,
        scope: 'POINT',
        targetType: 'EQUIPMENT',
        targetId: binding.targetId,
        sourcePointId: binding.sourcePointId!,
      };
      const id = telemetryWatchId(expectation);
      if (uniquePoints.has(id)) continue;
      const state = stateById.get(id);
      const node = await this.topology.getById(binding.targetId);
      if (
        !state ||
        !node ||
        node.kind !== 'EQUIPMENT' ||
        node.lifecycle !== 'ACTIVE' ||
        node.equipmentType !== 'CIRCUIT_BREAKER'
      )
        continue;
      uniquePoints.set(id, { expectation, state, node });
    }

    const panelGroups = new Map<
      string,
      {
        panel: EquipmentNode;
        sourceIdentity: string;
        points: Array<{
          expectation: TelemetryWatchExpectation;
          state: TelemetryWatchState;
          node: EquipmentNode;
          offline: boolean;
          age: number;
        }>;
      }
    >();

    for (const point of uniquePoints.values()) {
      const panelId = point.node.parentEquipmentId;
      if (!panelId) continue;
      const panel = await this.topology.getById(panelId);
      if (
        !panel ||
        panel.kind !== 'EQUIPMENT' ||
        panel.lifecycle !== 'ACTIVE' ||
        panel.equipmentType !== 'PANEL'
      )
        continue;
      const lastUsable = point.state.lastUsableAt ?? point.state.firstExpectedAt;
      const age = safeAge(lastUsable, now);
      const offline =
        point.state.reportedOfflineStreak >= this.automaticReportedOfflineSamples ||
        age > this.automaticLossAfterMs;
      const key = point.expectation.sourceIdentity + '|' + panel.id;
      const group = panelGroups.get(key) ?? {
        panel,
        sourceIdentity: point.expectation.sourceIdentity,
        points: [],
      };
      group.points.push({ ...point, offline, age });
      panelGroups.set(key, group);
    }

    for (const group of panelGroups.values()) {
      if (!group.points.length) continue;
      const lost = group.points.filter((point) => point.offline);
      const panelContext = this.panelContext(group.sourceIdentity, group.panel.id);
      const panelFullyLost = lost.length === group.points.length;

      if (panelFullyLost) {
        for (const point of lost) await this.watches.markLost(point.expectation, nowIso);
        await this.assertAutomaticLoss({
          targetType: 'EQUIPMENT',
          targetId: group.panel.id,
          sourceContext: panelContext,
          sourceIdentity: group.sourceIdentity,
          age: Math.max(...lost.map((point) => point.age)),
          severity: 'WARNING',
          note: `All ${group.points.length} commissioned breaker points in this panel are unavailable.`,
          nowIso,
        });
        for (const point of group.points) {
          await this.resolveAutomaticLoss(
            point.node.id,
            this.pointContext(
              group.sourceIdentity,
              point.expectation.sourcePointId!,
              point.node.id,
            ),
            nowIso,
            'SUPERSEDED_BY_PANEL_TELEMETRY_LOSS',
          );
        }
        continue;
      }

      if (
        group.points.some(
          (point) => !point.offline && point.state.freshStreak >= this.automaticRecoverySamples,
        )
      ) {
        await this.resolveAutomaticLoss(
          group.panel.id,
          panelContext,
          nowIso,
          'PANEL_TELEMETRY_RECOVERED',
        );
      }

      for (const point of group.points) {
        const pointContext = this.pointContext(
          group.sourceIdentity,
          point.expectation.sourcePointId!,
          point.node.id,
        );
        if (point.offline) {
          await this.watches.markLost(point.expectation, nowIso);
          await this.assertAutomaticLoss({
            targetType: 'EQUIPMENT',
            targetId: point.node.id,
            sourceContext: pointContext,
            sourceIdentity: group.sourceIdentity,
            ...(point.expectation.sourcePointId
              ? { sourcePointId: point.expectation.sourcePointId }
              : {}),
            age: point.age,
            severity: 'WARNING',
            note:
              point.state.reportedOfflineStreak >= this.automaticReportedOfflineSamples
                ? 'Gateway repeatedly reports this commissioned breaker point OFFLINE.'
                : 'Commissioned breaker point has exceeded the automatic telemetry loss window.',
            nowIso,
          });
        } else if (point.state.freshStreak >= this.automaticRecoverySamples) {
          await this.resolveAutomaticLoss(
            point.node.id,
            pointContext,
            nowIso,
            'BREAKER_TELEMETRY_RECOVERED',
          );
        }
      }
    }
  }

  private async resolveDescendantAutomaticLoss(
    sourceIdentity: string,
    bindings: readonly TelemetryBinding[],
    observedAt: string,
    reason: string,
  ): Promise<void> {
    const seenBreakers = new Set<string>();
    const seenPanels = new Set<string>();
    for (const binding of bindings) {
      if (
        binding.sourceIdentity !== sourceIdentity ||
        binding.targetType !== 'EQUIPMENT' ||
        !binding.sourcePointId ||
        !isPointMetric(binding.metric)
      )
        continue;
      if (!seenBreakers.has(binding.targetId)) {
        seenBreakers.add(binding.targetId);
        await this.resolveAutomaticLoss(
          binding.targetId,
          this.pointContext(sourceIdentity, binding.sourcePointId, binding.targetId),
          observedAt,
          reason,
        );
      }
      const node = await this.topology.getById(binding.targetId);
      if (node?.kind !== 'EQUIPMENT' || !node.parentEquipmentId) continue;
      if (seenPanels.has(node.parentEquipmentId)) continue;
      seenPanels.add(node.parentEquipmentId);
      await this.resolveAutomaticLoss(
        node.parentEquipmentId,
        this.panelContext(sourceIdentity, node.parentEquipmentId),
        observedAt,
        reason,
      );
    }
  }

  private async assertAutomaticLoss(input: {
    targetType: 'DEVICE' | 'EQUIPMENT';
    targetId: string;
    sourceContext: string;
    sourceIdentity: string;
    sourcePointId?: string;
    age: number;
    severity: AlarmSeverity;
    note: string;
    nowIso: string;
  }): Promise<void> {
    const correlationKey = this.automaticCorrelationKey(input.targetId, input.sourceContext);
    const active = await this.alarms.getActiveByCorrelationKey(correlationKey);
    if (active && (active.severity === 'CRITICAL' || active.severity === input.severity)) return;

    await this.commands.assert({
      code: 'TELEMETRY_LOSS',
      targetType: input.targetType,
      targetId: input.targetId,
      sourceContext: input.sourceContext,
      severity: input.severity,
      evidence: [
        {
          id: randomUUID(),
          kind: 'WATCHDOG',
          sourceIdentity: input.sourceIdentity,
          ...(input.sourcePointId ? { sourcePointId: input.sourcePointId } : {}),
          metric: 'telemetry_age_ms',
          value: Number.isFinite(input.age) ? input.age : this.automaticLossAfterMs + 1,
          unit: 'ms',
          observedAt: input.nowIso,
          note: input.note,
        },
      ],
      observedAt: input.nowIso,
    });
  }

  private async resolveAutomaticLoss(
    targetId: string,
    sourceContext: string,
    observedAt: string,
    reason: string,
  ): Promise<void> {
    const correlationKey = this.automaticCorrelationKey(targetId, sourceContext);
    if (!(await this.alarms.getActiveByCorrelationKey(correlationKey))) return;
    await this.commands.resolve(correlationKey, reason, [], observedAt);
  }

  private automaticCorrelationKey(targetId: string, sourceContext: string): string {
    return [targetId, 'TELEMETRY_LOSS', sourceContext].join('|');
  }

  private sourceContext(sourceIdentity: string): string {
    return `auto-watch:mqtt:${sourceIdentity}:source`;
  }

  private panelContext(sourceIdentity: string, panelId: string): string {
    return `auto-watch:mqtt:${sourceIdentity}:panel:${panelId}`;
  }

  private pointContext(sourceIdentity: string, sourcePointId: string, targetId: string): string {
    return `auto-watch:mqtt:${sourceIdentity}:point:${sourcePointId}:${targetId}`;
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

  private async evaluateLegacyPolicyFreshness(now: number): Promise<void> {
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
        [
          evidence(sample, 'VOLTAGE', voltageV, 'V', {
            id: policy.id,
            assertThreshold: policy.lowVoltage.assertBelowV,
            clearThreshold: policy.lowVoltage.clearAboveV,
          }),
        ],
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
        [
          evidence(sample, 'CURRENT', currentA, 'A', {
            id: policy.id,
            assertThreshold: policy.overcurrent.assertAboveA,
            clearThreshold: policy.overcurrent.clearBelowA,
          }),
        ],
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

// Keep the automatic loss window tied to the same 5-minute BFDB cadence contract.
export const AUTOMATIC_TELEMETRY_EXPECTED_INTERVAL_MS = BFDB_EXPECTED_INTERVAL_MS;
