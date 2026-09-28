import type {
  BreakerTelemetryMetrics,
  BreakerTelemetryReading,
  TelemetryMetricValue,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

export type TelemetrySubscriber = (sample: TelemetrySample) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeReported(
  previous: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const merged: Record<string, unknown> = { ...structuredClone(previous) };

  for (const [key, value] of Object.entries(incoming)) {
    const old = merged[key];

    if (isRecord(old) && isRecord(value)) {
      merged[key] = { ...old, ...structuredClone(value) };
    } else {
      merged[key] = structuredClone(value);
    }
  }

  return merged;
}

function latestMetric(
  previous: TelemetryMetricValue | undefined,
  incoming: TelemetryMetricValue | undefined,
): TelemetryMetricValue | undefined {
  if (!incoming) return previous;
  if (!previous || incoming.observedAt >= previous.observedAt) return incoming;
  return previous;
}

function mergeReading(
  previous: BreakerTelemetryReading,
  incoming: BreakerTelemetryReading,
): BreakerTelemetryReading {
  const voltageV = latestMetric(previous.metrics.voltageV, incoming.metrics.voltageV);
  const currentA = latestMetric(previous.metrics.currentA, incoming.metrics.currentA);
  const powerW = latestMetric(previous.metrics.powerW, incoming.metrics.powerW);
  const energyKwh = latestMetric(previous.metrics.energyKwh, incoming.metrics.energyKwh);

  const metrics: BreakerTelemetryMetrics = {
    ...(voltageV ? { voltageV } : {}),
    ...(currentA ? { currentA } : {}),
    ...(powerW ? { powerW } : {}),
    ...(energyKwh ? { energyKwh } : {}),
  };

  const state =
    !incoming.state || (previous.state && incoming.state.observedAt < previous.state.observedAt)
      ? previous.state
      : incoming.state;

  return {
    ...previous,
    ...incoming,
    metrics,
    ...(state ? { state } : {}),
    receivedAt:
      incoming.receivedAt >= previous.receivedAt ? incoming.receivedAt : previous.receivedAt,
  };
}

function mergeReadings(
  previous: readonly BreakerTelemetryReading[] | undefined,
  incoming: readonly BreakerTelemetryReading[] | undefined,
): readonly BreakerTelemetryReading[] | undefined {
  if (!previous?.length && !incoming?.length) return undefined;

  const merged = new Map<string, BreakerTelemetryReading>();

  for (const reading of previous ?? []) {
    merged.set(reading.breakerId, structuredClone(reading));
  }

  for (const reading of incoming ?? []) {
    const old = merged.get(reading.breakerId);
    merged.set(reading.breakerId, old ? mergeReading(old, reading) : structuredClone(reading));
  }

  return [...merged.values()].sort((left, right) => {
    const panel = left.panelLabel.localeCompare(right.panelLabel);
    return panel === 0 ? left.position - right.position : panel;
  });
}

function mergeSample(
  previous: TelemetrySample | undefined,
  incoming: TelemetrySample,
): TelemetrySample {
  if (!previous) {
    return structuredClone(incoming);
  }

  const breakerReadings = mergeReadings(previous.breakerReadings, incoming.breakerReadings);
  const unmappedPointIds = [
    ...new Set([...(previous.unmappedPointIds ?? []), ...(incoming.unmappedPointIds ?? [])]),
  ].sort();

  return {
    ...previous,
    ...incoming,
    reported: mergeReported(previous.reported, incoming.reported),
    ...(breakerReadings ? { breakerReadings } : {}),
    ...(unmappedPointIds.length ? { unmappedPointIds } : {}),
  };
}

export class TelemetryHub {
  private readonly latestByEntity = new Map<string, TelemetrySample>();
  private readonly subscribers = new Map<number, TelemetrySubscriber>();
  private nextSubscriberId = 1;

  constructor(private readonly maxSubscribers: number) {
    if (!Number.isInteger(maxSubscribers) || maxSubscribers < 1) {
      throw new Error('Telemetry maxSubscribers must be a positive integer.');
    }
  }

  publish(sample: TelemetrySample): void {
    const merged = mergeSample(this.latestByEntity.get(sample.entityId), sample);
    this.latestByEntity.set(sample.entityId, structuredClone(merged));

    for (const subscriber of this.subscribers.values()) {
      subscriber(structuredClone(merged));
    }
  }

  latest(entityId: string): TelemetrySample | null {
    const sample = this.latestByEntity.get(entityId);
    return sample ? structuredClone(sample) : null;
  }

  snapshot(): readonly TelemetrySample[] {
    return [...this.latestByEntity.values()]
      .sort((left, right) => left.entityId.localeCompare(right.entityId))
      .map((sample) => structuredClone(sample));
  }

  subscribe(subscriber: TelemetrySubscriber): (() => void) | null {
    if (this.subscribers.size >= this.maxSubscribers) {
      return null;
    }

    const id = this.nextSubscriberId++;
    this.subscribers.set(id, subscriber);

    return () => {
      this.subscribers.delete(id);
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }
}
