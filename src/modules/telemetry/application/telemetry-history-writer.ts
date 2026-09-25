import type { TelemetryAcceptanceRepository } from '@/modules/telemetry/application/telemetry-acceptance-repository';
import {
  adaptTelemetryHistoryRecord,
  type TelemetryHistoryAdapter,
} from '@/modules/telemetry/application/telemetry-history-adapter';
import type { TelemetryHistorySink } from '@/modules/telemetry/application/telemetry-history-sink';

export interface TelemetryHistoryWriterOptions {
  readonly workerId: string;
  readonly batchSize: number;
  readonly leaseSeconds: number;
  readonly retryBaseSeconds: number;
  readonly retryMaxSeconds: number;
}

export interface TelemetryHistoryWriterRun {
  readonly claimed: number;
  readonly delivered: number;
  readonly deadLettered: number;
  readonly rescheduled: number;
  readonly leaseLost: number;
}

function requirePositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function errorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z0-9_.-]{1,64}$/.test(error.name)) {
    return error.name.toUpperCase();
  }

  return 'HISTORY_WRITE_FAILED';
}

export class TelemetryHistoryWriter {
  constructor(
    private readonly acceptance: TelemetryAcceptanceRepository,
    private readonly sink: TelemetryHistorySink,
    private readonly options: TelemetryHistoryWriterOptions,
    private readonly adapter: TelemetryHistoryAdapter = adaptTelemetryHistoryRecord,
  ) {
    if (!options.workerId.trim()) {
      throw new Error('Telemetry history workerId is required.');
    }

    requirePositiveInteger('Telemetry history batchSize', options.batchSize);
    requirePositiveInteger('Telemetry history leaseSeconds', options.leaseSeconds);
    requirePositiveInteger('Telemetry history retryBaseSeconds', options.retryBaseSeconds);
    requirePositiveInteger('Telemetry history retryMaxSeconds', options.retryMaxSeconds);

    if (options.retryMaxSeconds < options.retryBaseSeconds) {
      throw new Error('Telemetry history retryMaxSeconds must be >= retryBaseSeconds.');
    }
  }

  async runOnce(now = new Date().toISOString()): Promise<TelemetryHistoryWriterRun> {
    const claimed = await this.acceptance.claimPendingHistory({
      limit: this.options.batchSize,
      workerId: this.options.workerId,
      now,
      leaseSeconds: this.options.leaseSeconds,
    });

    let delivered = 0;
    let deadLettered = 0;
    let rescheduled = 0;
    let leaseLost = 0;

    for (const record of claimed) {
      const adapted = this.adapter(record);

      if (!adapted.ok) {
        const marked = await this.acceptance.markHistoryDeadLettered(
          record.eventId,
          this.options.workerId,
          now,
          adapted.error,
        );

        if (marked) {
          deadLettered += 1;
        } else {
          leaseLost += 1;
        }

        continue;
      }

      try {
        await this.sink.write(adapted.value);
      } catch (error) {
        const attemptExponent = Math.max(0, record.historyAttempts - 1);
        const retrySeconds = Math.min(
          this.options.retryMaxSeconds,
          this.options.retryBaseSeconds * 2 ** Math.min(attemptExponent, 20),
        );
        const nextAttemptAt = new Date(Date.parse(now) + retrySeconds * 1000).toISOString();

        const rescheduledRecord = await this.acceptance.rescheduleHistory(
          record.eventId,
          this.options.workerId,
          nextAttemptAt,
          errorCode(error),
        );

        if (rescheduledRecord) {
          rescheduled += 1;
        } else {
          leaseLost += 1;
        }

        continue;
      }

      const marked = await this.acceptance.markHistoryDelivered(
        record.eventId,
        this.options.workerId,
        now,
      );

      if (marked) {
        delivered += 1;
      } else {
        leaseLost += 1;
      }
    }

    return {
      claimed: claimed.length,
      delivered,
      deadLettered,
      rescheduled,
      leaseLost,
    };
  }
}
