import type { TelemetryQuarantineRepository } from '@/modules/telemetry/application/telemetry-quarantine-repository';
import type { TelemetryQuarantineRecord } from '@/modules/telemetry/domain/quarantine';

export class MemoryTelemetryQuarantineRepository implements TelemetryQuarantineRepository {
  private readonly entries: TelemetryQuarantineRecord[] = [];

  constructor(private readonly maxEntries = 1000) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Telemetry quarantine maxEntries must be a positive integer.');
    }
  }

  async record(entry: TelemetryQuarantineRecord): Promise<void> {
    this.entries.push(structuredClone(entry));

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  async listRecent(limit: number): Promise<readonly TelemetryQuarantineRecord[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), this.maxEntries);

    return this.entries
      .slice(-boundedLimit)
      .reverse()
      .map((entry) => structuredClone(entry));
  }
}
