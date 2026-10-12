import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import type {
  BreakerTelemetryMetrics,
  BreakerTelemetryReading,
  TelemetryMetricValue,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

interface BreakerLocation {
  shelfId: string;
  frameId: string;
  panelId: string;
  panelLabel: string;
  breakerId: string;
  breakerLabel: string;
  position: number;
}

const FRESH_MS = 30_000;

function isFresh(timestamp: string, now: number): boolean {
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= -FRESH_MS && age <= FRESH_MS;
}

function ownMetric(
  raw: unknown,
  expectedUnit: string,
  observedAt: string,
  now: number,
): TelemetryMetricValue | undefined {
  let value: unknown = raw;
  let timestamp = observedAt;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (typeof record.unit === 'string' && record.unit !== expectedUnit) return undefined;
    value = record.value;
    if (typeof record.observedAt === 'string') timestamp = record.observedAt;
  }
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numeric) && isFresh(timestamp, now)
    ? { value: numeric as number, observedAt: timestamp }
    : undefined;
}

/**
 * Render an Equipment's OWN canonical scalar readings or an explicitly bound
 * BFDB circuit. Never assign a gateway's 0_1_N points by panel position.
 */
export function resolveBdfbBreakerReadings(
  presentation: BdfbPresentation,
  aggregate: TelemetrySample | null,
  samples: readonly TelemetrySample[],
  now: number,
): Readonly<Record<string, BreakerTelemetryReading>> {
  const locations = new Map<string, BreakerLocation>();
  for (const shelf of presentation.shelves)
    for (const frame of shelf.frames)
      for (const panel of frame.panels)
        panel.positions.forEach((breaker, index) => {
          if (breaker)
            locations.set(breaker.id, {
              shelfId: shelf.id,
              frameId: frame.id,
              panelId: panel.id,
              panelLabel: panel.label,
              breakerId: breaker.id,
              breakerLabel: breaker.label,
              position: index + 1,
            });
        });

  const resolved = new Map<string, BreakerTelemetryReading>();
  for (const reading of aggregate?.breakerReadings ?? [])
    if (locations.has(reading.breakerId) && reading.deviceId === presentation.deviceId)
      resolved.set(reading.breakerId, reading);

  for (const sample of [...samples].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
    if (
      sample.targetType !== 'EQUIPMENT' ||
      sample.entityId !== sample.targetId ||
      sample.entityKind !== 'EQUIPMENT' ||
      !sample.bindingId ||
      !isFresh(sample.receivedAt, now)
    )
      continue;
    const location = locations.get(sample.targetId);
    if (!location) continue;
    // Point-derived Equipment samples require explicit metric-binding evidence.
    if (sample.sourcePointId && !sample.metricBindingIds?.length) continue;

    const observedAt = sample.sourceObservedAt ?? sample.receivedAt;
    const metrics: BreakerTelemetryMetrics = {
      ...(ownMetric(sample.reported.voltageV, 'V', observedAt, now)
        ? { voltageV: ownMetric(sample.reported.voltageV, 'V', observedAt, now)! }
        : {}),
      ...(ownMetric(sample.reported.currentA, 'A', observedAt, now)
        ? { currentA: ownMetric(sample.reported.currentA, 'A', observedAt, now)! }
        : {}),
      ...(ownMetric(sample.reported.powerW, 'W', observedAt, now)
        ? { powerW: ownMetric(sample.reported.powerW, 'W', observedAt, now)! }
        : {}),
      ...(ownMetric(sample.reported.energyKwh, 'kWh', observedAt, now)
        ? { energyKwh: ownMetric(sample.reported.energyKwh, 'kWh', observedAt, now)! }
        : {}),
    };
    const stateValue = sample.reported.state;
    const state =
      (typeof stateValue === 'string' || typeof stateValue === 'number') &&
      isFresh(observedAt, now)
        ? { value: String(stateValue), observedAt }
        : undefined;
    if (!Object.keys(metrics).length && !state) continue;

    const previous = resolved.get(location.breakerId);
    // The dedicated SOURCE identity wins over a parent's point projection;
    // a partial derived patch must not erase its merged BDFB reading.
    if (sample.sourcePointId && previous) continue;

    resolved.set(location.breakerId, {
      deviceId: presentation.deviceId,
      sourceIdentity: sample.sourceIdentity,
      ...location,
      rawPointId: sample.sourcePointId ?? 'OWN SOURCE',
      metrics,
      ...(state ? { state } : {}),
      receivedAt: sample.receivedAt,
    });
  }
  return Object.fromEntries(resolved);
}
