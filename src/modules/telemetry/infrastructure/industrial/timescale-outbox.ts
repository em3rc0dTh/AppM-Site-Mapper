import { randomUUID } from 'node:crypto';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export function industrialStoreUrl(path: string) {
  const base = process.env.TELEMETRY_STORE_URL;
  if (!base || !process.env.TELEMETRY_STORE_TOKEN)
    throw new Error('Industrial historical store not configured');
  const url = new URL(path, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Invalid historical store URL');
  return url;
}
export async function industrialHistoryDiagnostics() {
  if (process.env.INDUSTRIAL_TIMESCALE_ENABLED !== 'true')
    return { status: 'DISABLED', pending: 0, alerts: [] as string[] };
  try {
    const db = await getMongoDatabase();
    const q = db.collection('industrial_timescale_outbox');
    const [pending, oldest, state, retrying] = await Promise.all([
      q.countDocuments(),
      q.findOne({}, { sort: { createdAt: 1 } }),
      db.collection('industrial_delivery_status').findOne({ key: 'timescale' }),
      q.countDocuments({ lastFailureAt: { $exists: true } }),
    ]);
    const lagSeconds = oldest
      ? Math.max(0, (Date.now() - new Date(oldest.createdAt).getTime()) / 1000)
      : 0;
    const alerts = [
      ...(lagSeconds > 60 ? ['TIMESCALE_DELIVERY_LAG'] : []),
      ...(retrying > 0 ||
      (state?.lastFailureAt &&
        (!state.lastDeliveryAt || state.lastFailureAt > state.lastDeliveryAt))
        ? ['TIMESCALE_DELIVERY_FAILED']
        : []),
    ];
    return {
      status: alerts.length ? 'DEGRADED' : 'OK',
      pending,
      retrying,
      lagSeconds,
      failures: state?.failures ?? 0,
      lastDeliveryAt: state?.lastDeliveryAt ?? null,
      alerts,
    };
  } catch {
    return { status: 'UNAVAILABLE', alerts: ['TIMESCALE_DIAGNOSTICS_UNAVAILABLE'] };
  }
}

function boundedPositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** Durable Mongo outbox; leases permit concurrent delivery and recovery after a crash.
 * HTTP acknowledgement is followed by deletion; Timescale's composite key makes retries harmless.
 */
export function startIndustrialHistoryDelivery() {
  if (process.env.INDUSTRIAL_TIMESCALE_ENABLED !== 'true') return;
  getProcessSingleton('industrial-timescale-delivery', () => {
    const owner = randomUUID();
    const concurrency = boundedPositiveInt(process.env.INDUSTRIAL_TIMESCALE_CONCURRENCY, 4, 16);
    const batchesPerTick = boundedPositiveInt(
      process.env.INDUSTRIAL_TIMESCALE_BATCHES_PER_TICK,
      80,
      400,
    );
    const leaseMs = 60000;

    const tick = async () => {
      try {
        const db = await getMongoDatabase();
        const queue = db.collection('industrial_timescale_outbox');
        const status = db.collection('industrial_delivery_status');
        let processed = 0;

        while (processed < batchesPerTick) {
          const width = Math.min(concurrency, batchesPerTick - processed);
          const claimed = (
            await Promise.all(
              Array.from({ length: width }, () =>
                queue.findOneAndUpdate(
                  { availableAt: { $lte: new Date() } },
                  {
                    $set: { owner, availableAt: new Date(Date.now() + leaseMs) },
                    $inc: { attempts: 1 },
                  },
                  { sort: { createdAt: 1 }, returnDocument: 'after' },
                ),
              ),
            )
          ).filter((row) => row !== null);

          if (!claimed.length) break;

          const results = await Promise.all(
            claimed.map(async (row) => {
              try {
                const response = await fetch(industrialStoreUrl('/industrial-batch'), {
                  method: 'POST',
                  headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${process.env.TELEMETRY_STORE_TOKEN}`,
                  },
                  body: row.payloadJson as string,
                  signal: AbortSignal.timeout(10000),
                  redirect: 'error',
                });
                if (!response.ok) throw new Error('Historical delivery rejected');
                const acknowledgement = (await response.json()) as { accepted?: number };
                const expected = (JSON.parse(row.payloadJson as string) as { signals: unknown[] })
                  .signals.length;
                if (acknowledgement.accepted !== expected)
                  throw new Error('Historical delivery acknowledgement mismatch');
                await queue.deleteOne({ _id: row._id, owner });
                return true;
              } catch {
                await queue.updateOne(
                  { _id: row._id, owner },
                  {
                    $set: {
                      lastFailureAt: new Date(),
                      availableAt: new Date(
                        Date.now() +
                          Math.min(300000, 1000 * 2 ** Math.min(Number(row.attempts), 8)),
                      ),
                    },
                  },
                );
                return false;
              }
            }),
          );

          processed += claimed.length;
          const delivered = results.filter(Boolean).length;
          const failed = results.length - delivered;
          const now = new Date().toISOString();

          if (delivered) {
            await status.updateOne(
              { key: 'timescale' },
              { $set: { lastDeliveryAt: now } },
              { upsert: true },
            );
          }
          if (failed) {
            await status.updateOne(
              { key: 'timescale' },
              { $inc: { failures: failed }, $set: { lastFailureAt: now } },
              { upsert: true },
            );
            break;
          }
        }
      } catch {
        /* Mongo unavailable: retain all work and retry on next tick. */
      } finally {
        setTimeout(() => void tick(), 2000).unref();
      }
    };
    void tick();
    return { owner };
  });
}
