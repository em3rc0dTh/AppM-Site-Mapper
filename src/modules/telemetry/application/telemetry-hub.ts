import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

export type TelemetrySubscriber = (sample: TelemetrySample) => void;

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
    this.latestByEntity.set(sample.entityId, structuredClone(sample));

    for (const subscriber of this.subscribers.values()) {
      subscriber(structuredClone(sample));
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
