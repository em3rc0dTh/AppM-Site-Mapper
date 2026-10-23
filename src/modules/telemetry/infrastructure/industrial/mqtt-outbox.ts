import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Envelope } from '@/modules/telemetry/domain/industrial/observations';
/** Private persistent volume; one outbox directory per application replica. */
export class MqttObservationOutbox {
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
  async start() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = (await readdir(this.directory)).filter((name) =>
      /^[a-f0-9-]{36}\.json$/.test(name),
    );
    if (files.length > this.maxPending) throw new Error('MQTT outbox exceeds configured capacity');
    for (const name of files) this.files.add(name);
    void this.flush();
  }
  async enqueue(envelope: Envelope) {
    if (this.stopped || this.files.size + this.reserved >= this.maxPending)
      throw new Error('MQTT outbox unavailable or full');
    this.reserved++;
    try {
      const captureId = randomUUID();
      const body = JSON.stringify({ ...envelope, captureId });
      if (Buffer.byteLength(body) > 300000) throw new Error('MQTT outbox capture too large');
      const file = captureId + '.json';
      await writeFile(join(this.directory, file + '.tmp'), body, { mode: 0o600 });
      await rename(join(this.directory, file + '.tmp'), join(this.directory, file));
      this.files.add(file);
      void this.flush();
      return captureId;
    } finally {
      this.reserved--;
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
        } catch {
          this.onError();
        }
      }
    })().finally(() => {
      this.flushing = undefined;
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.flush(), this.retryMs);
        this.timer.unref();
      }
    });
    return this.flushing;
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.flushing;
  }
  pending() {
    return this.files.size + this.reserved;
  }
}
