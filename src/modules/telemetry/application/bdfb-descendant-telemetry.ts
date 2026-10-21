import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export type BdfbMetric = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

export interface BdfbDescendantTelemetry {
  readonly descendantEquipment: number;
  readonly reportingEquipment: number;
  readonly withoutCurrentReading: number;
  readonly averageVoltageV: number | null;
  readonly averageCurrentA: number | null;
  readonly averagePowerW: number | null;
  /** Mean of individual cumulative counters; NOT energy consumed in a time window. */
  readonly averageEnergyKwh: number | null;
  /** Sum of current powers, not an average. Null when no current power exists. */
  readonly totalPowerW: number | null;
  readonly powerReportingEquipment: number;
  readonly latestReceivedAt: string | null;
}

type MeasuredValue = {
  readonly value: number;
  readonly observedAt: number;
  readonly receivedAt: number;
};
type EquipmentReadings = Partial<Record<BdfbMetric, MeasuredValue>>;

const METRICS: readonly BdfbMetric[] = ['voltageV', 'currentA', 'powerW', 'energyKwh'];
const MAX_AGE_MS = 30_000;

function isFresh(iso: string, now: number): boolean {
  const age = now - Date.parse(iso);
  return Number.isFinite(age) && age >= -MAX_AGE_MS && age <= MAX_AGE_MS;
}

function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

/**
 * Canonical LIVE aggregation for the whole BDFB Device.
 *
 * - Only ACTIVE descendant Equipment IDs supplied by topology may contribute.
 * - Only explicitly metric-bound, fresh, normalized Equipment readings contribute.
 * - One latest value per Equipment / metric; no duplicate sample or RAW point summing.
 * - Competing live sources for the same Equipment are excluded rather than guessed.
 * - Missing power is unknown, never a synthetic zero.
 * - No historical energy consumption is inferred from cumulative energy counters.
 */
export function aggregateBdfbDescendantTelemetry(
  samples: readonly TelemetrySample[],
  descendantEquipmentIds: readonly string[],
  now: number,
): BdfbDescendantTelemetry {
  const allowed = new Set(descendantEquipmentIds);
  const readings = new Map<string, EquipmentReadings>();
  const identities = new Map<string, Set<string>>();

  for (const sample of samples) {
    if (
      sample.targetType !== 'EQUIPMENT' ||
      !allowed.has(sample.targetId) ||
      !sample.metricBindingIds?.length ||
      !isFresh(sample.sourceObservedAt ?? sample.receivedAt, now) ||
      !isFresh(sample.receivedAt, now)
    )
      continue;

    const values: [BdfbMetric, MeasuredValue][] = [];
    for (const key of METRICS) {
      const raw = sample.reported[key];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const metric = raw as { value?: unknown; observedAt?: unknown };
      if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) continue;
      const observedAt =
        typeof metric.observedAt === 'string'
          ? metric.observedAt
          : (sample.sourceObservedAt ?? sample.receivedAt);
      if (!isFresh(observedAt, now)) continue;
      values.push([
        key,
        {
          value: metric.value,
          observedAt: Date.parse(observedAt),
          receivedAt: Date.parse(sample.receivedAt),
        },
      ]);
    }
    if (!values.length) continue;

    const source = `${sample.sourceIdentity}/${sample.sourcePointId ?? ''}`;
    const sources = identities.get(sample.targetId) ?? new Set<string>();
    sources.add(source);
    identities.set(sample.targetId, sources);

    const current = readings.get(sample.targetId) ?? {};
    for (const [key, value] of values) {
      const previous = current[key];
      if (
        !previous ||
        value.observedAt > previous.observedAt ||
        (value.observedAt === previous.observedAt && value.receivedAt > previous.receivedAt)
      )
        current[key] = value;
    }
    readings.set(sample.targetId, current);
  }

  // Do not choose an arbitrary winner if multiple fresh sources claim one Equipment.
  const valid = [...readings.entries()]
    .filter(([id]) => identities.get(id)?.size === 1)
    .map(([, metrics]) => metrics);
  const values = (key: BdfbMetric) =>
    valid.flatMap((entry) => (entry[key] ? [entry[key]!.value] : []));
  const powers = values('powerW');
  const latest = valid.flatMap((entry) =>
    METRICS.flatMap((key) => (entry[key] ? [entry[key]!.receivedAt] : [])),
  );
  const reportingEquipment = valid.length;

  return {
    descendantEquipment: allowed.size,
    reportingEquipment,
    withoutCurrentReading: Math.max(0, allowed.size - reportingEquipment),
    averageVoltageV: average(values('voltageV')),
    averageCurrentA: average(values('currentA')),
    averagePowerW: average(powers),
    averageEnergyKwh: average(values('energyKwh')),
    totalPowerW: powers.length ? powers.reduce((sum, value) => sum + value, 0) : null,
    powerReportingEquipment: powers.length,
    latestReceivedAt: latest.length ? new Date(Math.max(...latest)).toISOString() : null,
  };
}
