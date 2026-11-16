import type { CommunicationProfile } from '@/modules/industrial/domain/commissioning';
import type { SnmpBdfbLoadView } from '@/modules/telemetry/application/snmp-feed-service';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { TelemetryDiagnostics } from '@/modules/telemetry/infrastructure/telemetry-runtime';

export type CommissioningEnvironment = 'LAB' | 'FIELD' | 'DECLARED';
export type CommunicationStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'ERROR';

export interface CommissioningSourceView {
  readonly protocol: 'MQTT' | 'SNMP';
  readonly sourceIdentity: string;
  readonly environment: CommissioningEnvironment;
  readonly communication: CommunicationStatus;
  readonly lastSeenAt: string | null;
  readonly bindingCount: number;
  readonly targetCount: number;
  readonly rawStatus: string;
}

export interface CommissioningBindingView {
  readonly id: string;
  readonly protocol: string;
  readonly sourceIdentity: string;
  readonly sourcePointId: string | null;
  readonly metric: string;
  readonly targetType: TelemetryBinding['targetType'];
  readonly targetId: string;
  readonly targetLabel: string;
  readonly commissioning: string | null;
  readonly measurementSource: string | null;
}

export interface CommissioningObservability {
  readonly generatedAt: string;
  readonly mqttConnection: TelemetryDiagnostics['connection'];
  readonly history: {
    readonly enabled: boolean;
    readonly status: 'HEALTHY' | 'DEGRADED' | 'DISABLED';
    readonly lastWriteAt: string | null;
    readonly failures: number;
  };
  readonly sources: readonly CommissioningSourceView[];
  readonly bindings: readonly CommissioningBindingView[];
}

function latest(values: readonly (string | null | undefined)[]): string | null {
  const timestamps = values
    .filter(
      (value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)),
    )
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0] ?? null;
}

function bindingEnvironment(
  protocol: 'MQTT' | 'SNMP',
  sourceIdentity: string,
  bindings: readonly TelemetryBinding[],
  profiles: readonly CommunicationProfile[],
  fieldVerifiedAccessPortIds: ReadonlySet<string>,
): CommissioningEnvironment {
  const sourceBindings = bindings.filter(
    (binding) => binding.protocol === protocol && binding.sourceIdentity === sourceIdentity,
  );
  if (
    sourceBindings.some((binding) => {
      const commissioning =
        typeof binding.attributes?.commissioning === 'string'
          ? binding.attributes.commissioning.toUpperCase()
          : '';
      return (
        binding.attributes?.synthetic === true ||
        binding.attributes?.environment === 'LAB' ||
        commissioning.includes('LAB')
      );
    })
  )
    return 'LAB';

  if (protocol === 'MQTT') {
    const profile = profiles.find(
      (candidate) => candidate.role === 'GATEWAY' && candidate.sourceIdentity === sourceIdentity,
    );
    return profile?.recordStatus === 'FIELD_VERIFIED' ? 'FIELD' : 'DECLARED';
  }

  const targetIds = sourceBindings
    .filter((binding) => binding.targetType === 'ACCESS_PORT')
    .map((binding) => binding.targetId);
  return targetIds.length > 0 && targetIds.every((id) => fieldVerifiedAccessPortIds.has(id))
    ? 'FIELD'
    : 'DECLARED';
}

function mqttStatus(
  sourceIdentity: string,
  diagnostics: TelemetryDiagnostics,
): { communication: CommunicationStatus; lastSeenAt: string | null; rawStatus: string } {
  const source = diagnostics.sources.find((item) => item.serial === sourceIdentity);
  if (source) {
    return {
      communication: source.freshness,
      lastSeenAt: source.lastRawAt,
      rawStatus: source.freshness,
    };
  }
  const runtimeError =
    diagnostics.lastConnectionError && ['reconnecting', 'stopped'].includes(diagnostics.connection);
  return {
    communication: runtimeError ? 'ERROR' : 'OFFLINE',
    lastSeenAt: null,
    rawStatus: runtimeError ? diagnostics.connection.toUpperCase() : 'NO_SOURCE_DIAGNOSTIC',
  };
}

function snmpStatus(
  sourceIdentity: string,
  load: SnmpBdfbLoadView | null,
): { communication: CommunicationStatus; lastSeenAt: string | null; rawStatus: string } {
  const feeds = load?.feeds.filter((feed) => feed.sourceIdentity === sourceIdentity) ?? [];
  if (!feeds.length) return { communication: 'OFFLINE', lastSeenAt: null, rawStatus: 'NO_DATA' };

  const statuses = [...new Set(feeds.map((feed) => feed.status))];
  const live = feeds.filter((feed) => feed.status === 'LIVE' || feed.status === 'LAB_LIVE').length;
  const communication: CommunicationStatus = statuses.includes('CONFLICT')
    ? 'ERROR'
    : live === feeds.length
      ? 'LIVE'
      : live > 0 || statuses.includes('STALE')
        ? 'STALE'
        : 'OFFLINE';
  return {
    communication,
    lastSeenAt: latest(feeds.map((feed) => feed.observedAt)),
    rawStatus: statuses.sort().join('+'),
  };
}

export function composeCommissioningObservability(input: {
  readonly profiles: readonly CommunicationProfile[];
  readonly bindings: readonly TelemetryBinding[];
  readonly targetLabels: ReadonlyMap<string, string>;
  readonly fieldVerifiedAccessPortIds: ReadonlySet<string>;
  readonly mqtt: TelemetryDiagnostics;
  readonly snmp: SnmpBdfbLoadView | null;
  readonly now?: string;
}): CommissioningObservability {
  const active = input.bindings.filter((binding) => binding.lifecycle === 'ACTIVE');
  const sources = new Map<string, { protocol: 'MQTT' | 'SNMP'; sourceIdentity: string }>();

  for (const profile of input.profiles) {
    if (profile.role === 'GATEWAY' && profile.sourceIdentity) {
      sources.set('MQTT\0' + profile.sourceIdentity, {
        protocol: 'MQTT',
        sourceIdentity: profile.sourceIdentity,
      });
    }
  }
  for (const binding of active) {
    if (binding.protocol !== 'MQTT' && binding.protocol !== 'SNMP') continue;
    sources.set(binding.protocol + '\0' + binding.sourceIdentity, {
      protocol: binding.protocol,
      sourceIdentity: binding.sourceIdentity,
    });
  }

  const sourceViews = [...sources.values()]
    .map(({ protocol, sourceIdentity }): CommissioningSourceView => {
      const matching = active.filter(
        (binding) => binding.protocol === protocol && binding.sourceIdentity === sourceIdentity,
      );
      const status =
        protocol === 'MQTT'
          ? mqttStatus(sourceIdentity, input.mqtt)
          : snmpStatus(sourceIdentity, input.snmp);
      return {
        protocol,
        sourceIdentity,
        environment: bindingEnvironment(
          protocol,
          sourceIdentity,
          active,
          input.profiles,
          input.fieldVerifiedAccessPortIds,
        ),
        communication: status.communication,
        lastSeenAt: status.lastSeenAt,
        bindingCount: matching.length,
        targetCount: new Set(matching.map((binding) => binding.targetId)).size,
        rawStatus: status.rawStatus,
      };
    })
    .sort(
      (left, right) =>
        left.protocol.localeCompare(right.protocol) ||
        left.sourceIdentity.localeCompare(right.sourceIdentity),
    );

  const bindingViews = active
    .filter((binding) => binding.protocol === 'MQTT' || binding.protocol === 'SNMP')
    .map((binding): CommissioningBindingView => ({
      id: binding.id,
      protocol: binding.protocol,
      sourceIdentity: binding.sourceIdentity,
      sourcePointId: binding.sourcePointId ?? null,
      metric: binding.metric,
      targetType: binding.targetType,
      targetId: binding.targetId,
      targetLabel: input.targetLabels.get(binding.targetId) ?? binding.targetId,
      commissioning:
        typeof binding.attributes?.commissioning === 'string'
          ? binding.attributes.commissioning
          : null,
      measurementSource:
        typeof binding.attributes?.measurementSource === 'string'
          ? binding.attributes.measurementSource
          : null,
    }))
    .sort(
      (left, right) =>
        left.protocol.localeCompare(right.protocol) ||
        left.sourceIdentity.localeCompare(right.sourceIdentity) ||
        (left.sourcePointId ?? '').localeCompare(right.sourcePointId ?? '') ||
        left.metric.localeCompare(right.metric),
    );

  return {
    generatedAt: input.now ?? new Date().toISOString(),
    mqttConnection: input.mqtt.connection,
    history: {
      enabled: input.mqtt.history.enabled,
      status: !input.mqtt.history.enabled
        ? 'DISABLED'
        : input.mqtt.history.failures > 0 && input.mqtt.history.lastError
          ? 'DEGRADED'
          : 'HEALTHY',
      lastWriteAt: input.mqtt.history.lastWriteAt,
      failures: input.mqtt.history.failures,
    },
    sources: sourceViews,
    bindings: bindingViews,
  };
}
