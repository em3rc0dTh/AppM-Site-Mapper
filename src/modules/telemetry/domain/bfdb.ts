import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import type {
  BreakerTelemetryMetrics,
  BreakerTelemetryReading,
  NormalizedTelemetryMessage,
  TelemetryBinding,
  TelemetryMetricValue,
} from '@/modules/telemetry/domain/entities';

interface ResolvedBreaker {
  readonly shelfId: string;
  readonly frameId: string;
  readonly panelId: string;
  readonly panelLabel: string;
  readonly breakerId: string;
  readonly breakerLabel: string;
  readonly position: number;
}

export interface BdfbBreakerBuildResult {
  readonly readings: readonly BreakerTelemetryReading[];
  readonly unmappedPointIds: readonly string[];
}

const BFDB_METRICS = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const;
type BfdbMetric = (typeof BFDB_METRICS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function metric(value: unknown, observedAt: string): TelemetryMetricValue | undefined {
  const numeric = finiteNumber(value);
  return numeric === null ? undefined : { value: numeric, observedAt };
}

function breakerMap(presentation: BdfbPresentation): ReadonlyMap<string, ResolvedBreaker> {
  const map = new Map<string, ResolvedBreaker>();

  for (const shelf of presentation.shelves) {
    for (const frame of shelf.frames) {
      for (const panel of frame.panels) {
        panel.positions.forEach((breaker, index) => {
          if (!breaker) return;
          map.set(breaker.id, {
            shelfId: shelf.id,
            frameId: frame.id,
            panelId: panel.id,
            panelLabel: panel.label,
            breakerId: breaker.id,
            breakerLabel: breaker.label,
            position: index + 1,
          });
        });
      }
    }
  }

  return map;
}

function metricBindingMap(
  bindings: readonly TelemetryBinding[],
  sourceIdentity: string,
  rawPointId: string,
): { targetId: string; metrics: ReadonlyMap<BfdbMetric, TelemetryBinding> } | null {
  const candidates = bindings.filter(
    (binding) =>
      binding.lifecycle === 'ACTIVE' &&
      binding.protocol === 'MQTT' &&
      binding.sourceIdentity === sourceIdentity &&
      binding.sourcePointId === rawPointId &&
      binding.targetType === 'EQUIPMENT',
  );
  if (candidates.length === 0) return null;

  const targetIds = new Set(candidates.map((binding) => binding.targetId));
  if (targetIds.size !== 1) return null;
  const targetId = [...targetIds][0];
  if (!targetId) return null;

  const metrics = new Map<BfdbMetric, TelemetryBinding>();
  for (const binding of candidates) {
    const name = binding.metric.toUpperCase();
    if (!BFDB_METRICS.includes(name as BfdbMetric)) continue;
    const typed = name as BfdbMetric;
    if (metrics.has(typed)) return null;
    metrics.set(typed, binding);
  }

  return metrics.size > 0 ? { targetId, metrics } : null;
}

export function buildBfdbBreakerReadings(
  presentation: BdfbPresentation,
  message: NormalizedTelemetryMessage,
  bindings: readonly TelemetryBinding[],
): BdfbBreakerBuildResult {
  if (message.protocol !== 'BFDB') return { readings: [], unmappedPointIds: [] };

  const observedAt = message.sourceObservedAt ?? message.receivedAt;
  const byBreaker = breakerMap(presentation);
  const readings: BreakerTelemetryReading[] = [];
  const unmappedPointIds: string[] = [];

  for (const [rawPointId, rawPoint] of Object.entries(message.reported)) {
    if (!isRecord(rawPoint)) {
      unmappedPointIds.push(rawPointId);
      continue;
    }

    const mapping = metricBindingMap(bindings, message.sourceIdentity, rawPointId);
    if (!mapping) {
      unmappedPointIds.push(rawPointId);
      continue;
    }

    const resolved = byBreaker.get(mapping.targetId);
    if (!resolved) {
      unmappedPointIds.push(rawPointId);
      continue;
    }

    const voltageV = mapping.metrics.has('VOLTAGE') ? metric(rawPoint.U1, observedAt) : undefined;
    const currentA = mapping.metrics.has('CURRENT') ? metric(rawPoint.I1, observedAt) : undefined;
    const powerW = mapping.metrics.has('POWER') ? metric(rawPoint.P1, observedAt) : undefined;
    const energyKwh = mapping.metrics.has('ENERGY') ? metric(rawPoint.EP1, observedAt) : undefined;
    const metrics: BreakerTelemetryMetrics = {
      ...(voltageV ? { voltageV } : {}),
      ...(currentA ? { currentA } : {}),
      ...(powerW ? { powerW } : {}),
      ...(energyKwh ? { energyKwh } : {}),
    };

    const state =
      rawPoint.state === undefined ? undefined : { value: String(rawPoint.state), observedAt };

    readings.push({
      deviceId: presentation.deviceId,
      sourceIdentity: message.sourceIdentity,
      shelfId: resolved.shelfId,
      frameId: resolved.frameId,
      panelId: resolved.panelId,
      panelLabel: resolved.panelLabel,
      breakerId: resolved.breakerId,
      breakerLabel: resolved.breakerLabel,
      rawPointId,
      position: resolved.position,
      metrics,
      ...(state ? { state } : {}),
      receivedAt: message.receivedAt,
    });
  }

  return { readings, unmappedPointIds };
}
