import type {
  BreakerTelemetryReading,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

export interface CompositionBreakerBinding {
  readonly id: string;
  readonly targetId: string;
  readonly sourceIdentity: string;
  readonly sourcePointId?: string;
  readonly metric: string;
}

export type BreakerLiveStatus =
  | 'LIVE'
  | 'STALE'
  | 'OFFLINE'
  | 'NO DATA'
  | 'UNMAPPED'
  | 'CONFLICT';

export interface CompositionBreakerTelemetry {
  readonly status: BreakerLiveStatus;
  readonly voltageV?: number;
  readonly currentA?: number;
  readonly powerW?: number;
  readonly energyKwh?: number;
  readonly state?: string;
  readonly sourceIdentity?: string;
  readonly sourcePointId?: string;
  readonly receivedAt?: string;
}

type ElectricalKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

const ELECTRICAL: ReadonlyArray<{
  key: ElectricalKey;
  metric: string;
  unit: string;
}> = [
  { key: 'voltageV', metric: 'VOLTAGE', unit: 'V' },
  { key: 'currentA', metric: 'CURRENT', unit: 'A' },
  { key: 'powerW', metric: 'POWER', unit: 'W' },
  { key: 'energyKwh', metric: 'ENERGY', unit: 'kWh' },
];

function numericMetric(value: unknown, expectedUnit: string): number | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const metric = value as Record<string, unknown>;
    if (metric.unit !== undefined && metric.unit !== expectedUnit) return undefined;
    value = metric.value;
  }
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function freshness(timestamp: string, now: number): BreakerLiveStatus {
  const delta = now - Date.parse(timestamp);
  if (!Number.isFinite(delta) || delta < -30_000 || delta > 300_000) return 'OFFLINE';
  return delta > 30_000 ? 'STALE' : 'LIVE';
}

function fromOwnSample(
  sample: TelemetrySample,
  links: readonly CompositionBreakerBinding[],
  now: number,
): CompositionBreakerTelemetry | null {
  if (sample.targetType !== 'EQUIPMENT' || sample.entityKind !== 'EQUIPMENT') return null;
  if (sample.entityId !== sample.targetId) return null;

  const matched = links.filter(
    (binding) =>
      binding.sourceIdentity === sample.sourceIdentity &&
      (sample.sourcePointId
        ? binding.sourcePointId === sample.sourcePointId &&
          sample.metricBindingIds?.includes(binding.id)
        : !binding.sourcePointId &&
          binding.metric.toUpperCase() === 'SOURCE' &&
          binding.id === sample.bindingId),
  );
  if (!matched.length) return null;
  const point = Boolean(sample.sourcePointId);
  const permitted = new Set(matched.map((binding) => binding.metric.toUpperCase()));
  const values: Partial<Record<ElectricalKey, number>> = {};
  const observed: string[] = [];

  for (const field of ELECTRICAL) {
    if (point && !permitted.has(field.metric)) continue;
    const raw = sample.reported[field.key];
    const value = numericMetric(raw, field.unit);
    if (value === undefined) continue;
    values[field.key] = value;
    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      typeof (raw as Record<string, unknown>).observedAt === 'string'
    ) {
      observed.push((raw as { observedAt: string }).observedAt);
    }
  }
  const stateValue = sample.reported.state;
  const state =
    typeof stateValue === 'string' || typeof stateValue === 'number'
      ? String(stateValue)
      : undefined;
  if (!Object.keys(values).length && !state) return null;
  const timestamp = observed.length ? observed.sort().at(-1)! : sample.sourceObservedAt ?? sample.receivedAt;

  return {
    status: freshness(timestamp, now),
    ...values,
    ...(state ? { state } : {}),
    sourceIdentity: sample.sourceIdentity,
    ...(sample.sourcePointId ? { sourcePointId: sample.sourcePointId } : {}),
    receivedAt: sample.receivedAt,
  };
}

function fromGatewayReading(
  reading: BreakerTelemetryReading,
  source: TelemetrySample,
  links: readonly CompositionBreakerBinding[],
  now: number,
): CompositionBreakerTelemetry | null {
  if (source.sourceIdentity !== reading.sourceIdentity) return null;
  const matches = links.filter(
    (link) =>
      link.sourceIdentity === reading.sourceIdentity &&
      link.sourcePointId === reading.rawPointId,
  );
  if (!matches.length) return null;
  const permitted = new Set(matches.map((link) => link.metric.toUpperCase()));
  const values: Partial<Record<ElectricalKey, number>> = {};
  const observed: string[] = [];
  for (const field of ELECTRICAL) {
    if (!permitted.has(field.metric)) continue;
    const metric = reading.metrics[field.key];
    if (!metric) continue;
    values[field.key] = metric.value;
    observed.push(metric.observedAt);
  }
  if (!Object.keys(values).length && !reading.state) return null;
  const timestamp =
    observed.length ? observed.sort().at(-1)! : reading.state?.observedAt ?? reading.receivedAt;
  return {
    status: freshness(timestamp, now),
    ...values,
    ...(reading.state ? { state: reading.state.value } : {}),
    sourceIdentity: reading.sourceIdentity,
    sourcePointId: reading.rawPointId,
    receivedAt: reading.receivedAt,
  };
}

/**
 * Only a verified Equipment SOURCE or an explicitly bound BFDB point can
 * supply a breaker. A parent panel's raw 0_1_N fields are never mapped by
 * positional coincidence, even if the parent SN matches its MQTT publisher.
 */
export function compositionBreakerTelemetry(
  breakerId: string,
  deviceId: string,
  samples: readonly TelemetrySample[],
  bindings: readonly CompositionBreakerBinding[],
  now: number,
): CompositionBreakerTelemetry {
  const links = bindings.filter((link) => link.targetId === breakerId);
  if (!links.length) return { status: 'UNMAPPED' };

  const own = samples.flatMap((sample) => {
    if (sample.targetId !== breakerId) return [];
    const reading = fromOwnSample(sample, links, now);
    return reading ? [reading] : [];
  });
  const direct = own.filter((reading) => reading.sourcePointId === undefined);
  if (new Set(direct.map((reading) => reading.sourceIdentity)).size > 1)
    return { status: 'CONFLICT' };
  if (direct.length) return direct.sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''))[0]!;

  const derived = [...own.filter((reading) => reading.sourcePointId !== undefined)];
  for (const source of samples)
    for (const reading of source.breakerReadings ?? []) {
      if (reading.breakerId !== breakerId || reading.deviceId !== deviceId) continue;
      const projection = fromGatewayReading(reading, source, links, now);
      if (projection) derived.push(projection);
    }
  if (new Set(derived.map((reading) => reading.sourceIdentity + '/' + reading.sourcePointId)).size > 1)
    return { status: 'CONFLICT' };
  if (!derived.length) return { status: 'NO DATA' };
  return derived.sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''))[0]!;
}
