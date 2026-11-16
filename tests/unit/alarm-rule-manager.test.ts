import { describe, expect, it } from 'vitest';

import { AlarmCommandService } from '@/modules/alarm/application/alarm-command-service';
import { EffectiveAlarmPolicyRepository } from '@/modules/alarm/application/effective-alarm-policy-repository';
import { AlarmService } from '@/modules/alarm/application/alarm-service';
import { TelemetryAlarmEvaluator } from '@/modules/alarm/application/telemetry-alarm-evaluator';
import {
  DEFAULT_DC_PROFILE,
  parseRuleDraft,
  resolveRules,
  type RuleDraftInput,
} from '@/modules/alarm/domain/rule-manager';
import { MemoryAlarmPolicyRepository } from '@/modules/alarm/infrastructure/memory-alarm-policy-repository';
import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import { MemoryRuleManagerStore } from '@/modules/alarm/infrastructure/rule-manager-store';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { TelemetrySample, TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const createdAt = '2026-11-16T08:00:00.000Z';
function topology() {
  return new MemoryTopologyRepository([
    {
      id: 'qdf',
      name: 'QDF 2',
      kind: 'DEVICE',
      parentId: null,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'panel',
      name: 'A3',
      kind: 'EQUIPMENT',
      equipmentType: 'PANEL',
      deviceId: 'qdf',
      parentId: 'qdf',
      parentEquipmentId: null,
      childMode: 'POSITIONAL',
      children: ['breaker'],
      accessPorts: [],
      pinned: false,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'breaker',
      name: 'A3-02',
      kind: 'EQUIPMENT',
      equipmentType: 'CIRCUIT_BREAKER',
      deviceId: 'qdf',
      parentId: 'panel',
      parentEquipmentId: 'panel',
      childMode: 'DYNAMIC',
      children: [],
      accessPorts: [],
      pinned: false,
      lifecycle: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
  ] as unknown as readonly TopologyNode[]);
}
function binding(): TelemetryBinding {
  return {
    id: 'b1',
    protocol: 'MQTT',
    sourceIdentity: 'QDF-EMU',
    sourcePointId: '0_1_2',
    metric: 'CURRENT',
    targetType: 'EQUIPMENT',
    targetId: 'breaker',
    lifecycle: 'ACTIVE',
    createdAt,
    updatedAt: createdAt,
  };
}
function sample(
  currentA: number,
  at: string,
  options: { voltage?: number; energy?: number } = {},
): TelemetrySample {
  return {
    bindingId: 'b1',
    sourcePointId: '0_1_2',
    targetId: 'breaker',
    targetType: 'EQUIPMENT',
    entityId: 'breaker',
    entityKind: 'EQUIPMENT',
    sourceIdentity: 'QDF-EMU',
    receivedAt: at,
    sourceObservedAt: at,
    reported: {
      currentA: { value: currentA, unit: 'A', observedAt: at },
      ...(options.voltage !== undefined
        ? { voltageV: { value: options.voltage, unit: 'V', observedAt: at } }
        : {}),
      ...(options.energy !== undefined
        ? { energyKwh: { value: options.energy, unit: 'kWh', observedAt: at } }
        : {}),
    },
  };
}
function draft(
  code: RuleDraftInput['code'],
  parameters: RuleDraftInput['parameters'],
  scope: RuleDraftInput['scope'] = 'BREAKER',
  scopeId: string | null = 'breaker',
): RuleDraftInput {
  return {
    code,
    scope,
    scopeId,
    electricalProfileId: DEFAULT_DC_PROFILE.id,
    parameters,
    severity: 'WARNING',
    debounceSamples: 2,
    recoverySamples: 2,
  };
}

describe('Alarm Rule Manager MK1', () => {
  it('preserves rectifier setpoints as references, not commissioned voltage alarm limits', () => {
    expect(DEFAULT_DC_PROFILE.referenceVoltageV).toBe(54.5);
    expect(DEFAULT_DC_PROFILE.boostVoltageV).toBe(56.5);
    expect(DEFAULT_DC_PROFILE.rectifierOvsV).toBe(59);
    expect(DEFAULT_DC_PROFILE.voltageLimitsCommissioned).toBe(false);
  });

  it('accepts unfinished drafts but rejects publication without correct hysteresis', () => {
    const value = draft('LOW_VOLTAGE', { assertBelowV: 0, clearAboveV: 0 });
    expect(parseRuleDraft(value).code).toBe('LOW_VOLTAGE');
    expect(() => parseRuleDraft(value, true)).toThrow('INVALID_RULE_HYSTERESIS');
    expect(() =>
      parseRuleDraft({ ...value, parameters: { assertBelowV: 49, clearAboveV: 51 } }, true),
    ).not.toThrow();
    expect(() =>
      parseRuleDraft(
        { ...value, parameters: { assertBelowV: 50, clearAboveV: 52, __proto__: { hack: true } } },
        true,
      ),
    ).not.toThrow();
  });

  it('retains previous published version when a draft changes and audits every transition', async () => {
    const store = new MemoryRuleManagerStore();
    const first = await store.saveDraft(
      draft('LOAD_LOSS', { zeroToleranceA: 0.2, referenceMinA: 1, expectedLoad: true }),
      'admin',
    );
    const live = await store.changeStatus(first.id, first.revision, 'PUBLISH', 'admin');
    expect(live.published?.status).toBe('PUBLISHED');
    const edited = await store.saveDraft(
      {
        ...draft('LOAD_LOSS', { zeroToleranceA: 0.1, referenceMinA: 2, expectedLoad: true }),
        id: live.id,
        expectedRevision: live.revision,
      },
      'admin',
    );
    expect(edited.draft.parameters.referenceMinA).toBe(2);
    expect(edited.published?.parameters.referenceMinA).toBe(1);
    await expect(store.changeStatus(edited.id, 1, 'DISABLE', 'admin')).rejects.toThrow(
      'RULE_STALE_WRITE',
    );
    const disabled = await store.changeStatus(edited.id, edited.revision, 'DISABLE', 'admin');
    expect(disabled.published).toBeNull();
    expect(disabled.audit.map((x) => x.action)).toEqual([
      'CREATED',
      'PUBLISHED',
      'DRAFT_UPDATED',
      'DISABLED',
    ]);
  });

  it('resolves breaker overrides over QDF and global without rewriting legacy policies', async () => {
    const store = new MemoryRuleManagerStore();
    const global = await store.saveDraft(
      draft('LOW_CURRENT', { assertBelowA: 0.4, clearAboveA: 0.8 }, 'GLOBAL', null),
      'admin',
    );
    await store.changeStatus(global.id, global.revision, 'PUBLISH', 'admin');
    const qdf = await store.saveDraft(
      draft('LOW_CURRENT', { assertBelowA: 1, clearAboveA: 2 }, 'QDF', 'qdf'),
      'admin',
    );
    await store.changeStatus(qdf.id, qdf.revision, 'PUBLISH', 'admin');
    const local = await store.saveDraft(
      draft('LOW_CURRENT', { assertBelowA: 2, clearAboveA: 3 }),
      'admin',
    );
    await store.changeStatus(local.id, local.revision, 'PUBLISH', 'admin');

    const published = (await store.list()).flatMap((r) => (r.published ? [r.published] : []));
    expect(
      resolveRules(published, { qdfIds: ['qdf'], panelIds: ['panel'], breakerId: 'breaker' }).find(
        (r) => r.code === 'LOW_CURRENT',
      )?.scope,
    ).toBe('BREAKER');
    const legacy = new MemoryAlarmPolicyRepository();
    const effective = new EffectiveAlarmPolicyRepository(
      legacy,
      store,
      topology(),
      new MemoryTelemetryBindingRepository([binding()]),
    );
    const policies = await effective.listEnabledForTarget('EQUIPMENT', 'breaker');
    expect(policies).toHaveLength(1);
    expect(policies[0]?.lowCurrent?.assertBelowA).toBe(2);
    expect(await legacy.listEnabled()).toHaveLength(0);
  });

  it('raises LOAD_LOSS only after previous load and valid independent breaker samples', async () => {
    const store = new MemoryRuleManagerStore();
    const first = await store.saveDraft(
      draft('LOAD_LOSS', { zeroToleranceA: 0.2, referenceMinA: 1, expectedLoad: true }),
      'admin',
    );
    await store.changeStatus(first.id, first.revision, 'PUBLISH', 'admin');
    const topo = topology(),
      alarms = new MemoryAlarmRepository();
    const policies = new EffectiveAlarmPolicyRepository(
      new MemoryAlarmPolicyRepository(),
      store,
      topo,
      new MemoryTelemetryBindingRepository([binding()]),
    );
    const evaluator = new TelemetryAlarmEvaluator(alarms, policies, topo);
    await evaluator.observe(sample(0, '2026-11-16T08:01:00.000Z', { voltage: 54.5 }));
    expect(await alarms.listActive()).toHaveLength(0);
    await evaluator.observe(sample(8.4, '2026-11-16T08:02:00.000Z', { voltage: 54.5 }));
    await evaluator.observe(sample(0, '2026-11-16T08:03:00.000Z', { voltage: 54.5 }));
    await evaluator.observe(sample(0, '2026-11-16T08:03:00.000Z', { voltage: 54.5 }));
    expect(await alarms.listActive()).toHaveLength(0);
    await evaluator.observe(sample(0, '2026-11-16T08:04:00.000Z', { voltage: 54.5 }));
    expect((await alarms.listActive()).map((a) => a.alarmCode)).toEqual(['LOAD_LOSS']);
    await evaluator.observe({
      ...sample(0, '2026-11-16T08:05:00.000Z'),
      reported: { currentA: { value: 0, unit: 'A' }, state: 'OFFLINE' },
    });
    expect(await alarms.listActive()).toHaveLength(1);
    await evaluator.observe(sample(8.4, '2026-11-16T08:06:00.000Z'));
    await evaluator.observe(sample(8.4, '2026-11-16T08:07:00.000Z'));
    expect(await alarms.listActive()).toHaveLength(0);
  });

  it('groups coincident conditions without hiding separate alarm occurrences', async () => {
    const topo = topology(),
      alarms = new MemoryAlarmRepository();
    const cmd = new AlarmCommandService(alarms, topo);
    await cmd.assert({
      code: 'LOAD_LOSS',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'managed:breaker',
      evidence: [],
      observedAt: '2026-11-16T08:01:00.000Z',
    });
    await cmd.assert({
      code: 'LOW_VOLTAGE',
      targetType: 'EQUIPMENT',
      targetId: 'breaker',
      sourceContext: 'mqtt:point',
      evidence: [],
      observedAt: '2026-11-16T08:02:00.000Z',
    });
    const snap = await new AlarmService(alarms, topo).snapshot();
    expect(snap.global.activeAlarmCount).toBe(2);
    expect(snap.correlationGroups).toHaveLength(1);
    expect(snap.correlationGroups?.[0]?.occurrenceIds).toHaveLength(2);
  });
});
