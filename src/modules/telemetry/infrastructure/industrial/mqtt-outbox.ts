import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Envelope } from '@/modules/telemetry/domain/industrial/observations';
/** Private persistent volume; one outbox directory per application replica. */
export class MqttObservationOutbox {
  private counters = {
    queued: 0,
    committed: 0,
    rejected: 0,
    deliveryFailures: 0,
    spoolFailures: 0,
  };
  private lastFailureAt: string | null = null;
  private lastDeliveryAt: string | null = null;
  private diagnosticWriteFailed = false;
  private diagnosticWrites: Promise<void> = Promise.resolve();
  private diagnosticDirty = false;
  private diagnosticWriting = false;
  private readonly files = new Set<string>();
  private reserved = 0;
  private stopped = false;
  private flushing: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly directory: string,
    private readonly deliver: (envelope: Envelope) => Promise<unknown>,
    private readonly onError: () => void,
    private readonly maxPending = 1000,
    private readonly retryMs = 2000,
  ) {
    if (!Number.isInteger(maxPending) || maxPending < 1 || maxPending > 10000)
      throw new Error('Invalid MQTT outbox capacity');
  }
  diagnostics() {
    const pending = this.pending();
    const alerts: string[] = [];
    if (pending >= this.maxPending) alerts.push('MQTT_QUEUE_FULL');
    else if (pending >= Math.ceil(this.maxPending * 0.8)) alerts.push('MQTT_QUEUE_HIGH_WATER');
    if (this.counters.rejected || this.counters.spoolFailures)
      alerts.push('MQTT_CAPTURE_FAILURE_RECORDED');
    if (
      pending &&
      this.lastFailureAt &&
      (!this.lastDeliveryAt || this.lastFailureAt >= this.lastDeliveryAt)
    )
      alerts.push('MQTT_DELIVERY_RETRY');
    if (this.diagnosticWriteFailed) alerts.push('MQTT_DIAGNOSTIC_STORAGE_FAILED');
    return {
      version: 1,
      protocol: 'MQTT',
      updatedAt: new Date().toISOString(),
      pending,
      capacity: this.maxPending,
      counters: { ...this.counters },
      lastFailureAt: this.lastFailureAt,
      lastDeliveryAt: this.lastDeliveryAt,
      alerts,
    };
  }
  private persistDiagnostics() {
    this.diagnosticDirty = true;
    if (this.diagnosticWriting) return;
    this.diagnosticWriting = true;
    // Coalesce counters instead of accumulating one filesystem task per message.
    this.diagnosticWrites = (async () => {
      while (this.diagnosticDirty) {
        this.diagnosticDirty = false;
        try {
          const path = join(this.directory, 'diagnostics.json');
          await writeFile(path + '.tmp', JSON.stringify(this.diagnostics()), { mode: 0o600 });
          await rename(path + '.tmp', path);
          this.diagnosticWriteFailed = false;
        } catch {
          this.diagnosticWriteFailed = true;
          break;
        }
      }
    })().finally(() => {
      this.diagnosticWriting = false;
    });
  }
  recordCaptureRejection() {
    this.counters.rejected++;
    this.lastFailureAt = new Date().toISOString();
    this.persistDiagnostics();
  }
  async start() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      if ((await stat(join(this.directory, 'diagnostics.json'))).size > 65536)
        throw new Error('Oversized diagnostics');
      const raw = JSON.parse(await readFile(join(this.directory, 'diagnostics.json'), 'utf8')) as {
        counters?: Record<string, unknown>;
        lastFailureAt?: string;
        lastDeliveryAt?: string;
      };
      for (const key of Object.keys(this.counters) as (keyof typeof this.counters)[]) {
        const value = raw.counters?.[key];
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
          this.counters[key] = value;
      }
      if (raw.lastFailureAt && Number.isFinite(Date.parse(raw.lastFailureAt)))
        this.lastFailureAt = raw.lastFailureAt;
      if (raw.lastDeliveryAt && Number.isFinite(Date.parse(raw.lastDeliveryAt)))
        this.lastDeliveryAt = raw.lastDeliveryAt;
    } catch {
      /* Missing/unreadable snapshots are reported by the diagnostics reader. */
    }
    const files = (await readdir(this.directory)).filter((name) =>
      /^[a-f0-9-]{36}\.json$/.test(name),
    );
    for (const name of files) this.files.add(name);
    if (files.length > this.maxPending) {
      this.persistDiagnostics();
      await this.diagnosticWrites;
      throw new Error('MQTT outbox exceeds configured capacity');
    }
    void this.flush();
  }
  async enqueue(envelope: Envelope) {
    if (this.stopped || this.files.size + this.reserved >= this.maxPending) {
      this.recordCaptureRejection();
      throw new Error('MQTT outbox unavailable or full');
    }
    this.reserved++;
    try {
      const captureId = randomUUID();
      const body = JSON.stringify({ ...envelope, captureId });
      if (Buffer.byteLength(body) > 300000) throw new Error('MQTT outbox capture too large');
      const file = captureId + '.json';
      await writeFile(join(this.directory, file + '.tmp'), body, { mode: 0o600 });
      await rename(join(this.directory, file + '.tmp'), join(this.directory, file));
      this.files.add(file);
      this.counters.queued++;
      void this.flush();
      return captureId;
    } catch (error) {
      this.counters.spoolFailures++;
      this.lastFailureAt = new Date().toISOString();
      throw error;
    } finally {
      this.reserved--;
      this.persistDiagnostics();
    }
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    clearTimeout(this.timer);
    this.flushing = (async () => {
      for (const file of this.files) {
        if (this.stopped) break;
        try {
          const path = join(this.directory, file);
          if ((await stat(path)).size > 300000) throw new Error('Invalid MQTT spool record');
          const envelope = JSON.parse(await readFile(path, 'utf8')) as Envelope;
          await this.deliver(envelope);
          await unlink(path);
          this.files.delete(file);
          this.counters.committed++;
          this.lastDeliveryAt = new Date().toISOString();
          // Keep operator telemetry fresh during long drains: previously this
          // snapshot was written only after every queued file had completed.
          // Periodic checkpoints are coalesced and never delete spool data.
          if (this.counters.committed % 10 === 0) this.persistDiagnostics();
        } catch {
          this.counters.deliveryFailures++;
          this.lastFailureAt = new Date().toISOString();
          this.persistDiagnostics();
          this.onError();
        }
      }
    })().finally(() => {
      this.flushing = undefined;
      this.persistDiagnostics();
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.flush(), this.retryMs);
        this.timer.unref();
      }
    });
    return this.flushing;
  }
  async close() {
    if (this.stopped) {
      await this.flushing;
      await this.diagnosticWrites;
      return;
    }
    this.stopped = true;
    clearTimeout(this.timer);
    await this.flushing;
    this.persistDiagnostics();
    await this.diagnosticWrites;
  }
  pending() {
    return this.files.size + this.reserved;
  }
}
