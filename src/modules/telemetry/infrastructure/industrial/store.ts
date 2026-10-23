import { createHash } from 'node:crypto';
import type { Db, MongoClient } from 'mongodb';
import type { ObservationBatch, Signal } from '@/modules/telemetry/domain/industrial/observations';

export interface CatalogSignal extends Signal {
  firstSeenAt: string;
  lastSeenAt: string;
  activatedAt: string | null;
  resolvedAt: string | null;
  alarmObservedAt?: string | null;
  lastObservation?: Pick<
    Signal,
    'eventId' | 'receivedAt' | 'observedAt' | 'quality' | 'rawType' | 'rawValue' | 'profileVersion'
  >;
}
export interface ObservationStore {
  commit(batch: ObservationBatch): Promise<'committed' | 'duplicate'>;
  list(sourceIdentity?: string, limit?: number, targetId?: string): Promise<CatalogSignal[]>;
  history(
    signalId: string,
    before: string,
    limit: number,
    beforeEventId?: string,
  ): Promise<Signal[]>;
  event(eventId: string): Promise<ObservationBatch['envelope'] | null>;
  byIds(ids: readonly string[]): Promise<CatalogSignal[]>;
}
export function advanceSignal(previous: CatalogSignal | undefined, next: Signal): CatalogSignal {
  const firstSeenAt = previous?.firstSeenAt ?? next.receivedAt;
  const lastSeenAt =
    previous && previous.lastSeenAt > next.receivedAt ? previous.lastSeenAt : next.receivedAt;
  const cursor = previous?.lastObservation?.observedAt ?? previous?.observedAt;
  if (cursor && cursor > next.observedAt) return { ...previous!, lastSeenAt };
  const lastObservation = {
    eventId: next.eventId,
    receivedAt: next.receivedAt,
    observedAt: next.observedAt,
    quality: next.quality,
    rawType: next.rawType,
    rawValue: next.rawValue,
    profileVersion: next.profileVersion,
  };
  // An unrecognized field/profile downgrade cannot erase previously interpreted evidence.
  if (
    previous &&
    previous.kind !== 'unknown' &&
    (next.kind === 'unknown' || next.quality === 'UNKNOWN')
  )
    return { ...previous, quality: 'UNKNOWN', lastSeenAt, lastObservation };
  const alarmState =
    next.kind === 'alarm' && (next.alarmState === 'UNKNOWN' || next.alarmState === null)
      ? (previous?.alarmState ?? 'UNKNOWN')
      : next.alarmState;
  return {
    ...next,
    lastObservation,
    alarmObservedAt:
      next.kind === 'alarm' && ['ACTIVE', 'RESOLVED'].includes(next.alarmState ?? '')
        ? next.observedAt
        : (previous?.alarmObservedAt ?? null),
    alarmState,
    firstSeenAt,
    lastSeenAt,
    activatedAt:
      alarmState === 'ACTIVE'
        ? previous?.alarmState === 'ACTIVE'
          ? previous.activatedAt
          : next.observedAt
        : (previous?.activatedAt ?? null),
    resolvedAt:
      alarmState === 'RESOLVED'
        ? previous?.alarmState === 'RESOLVED'
          ? previous.resolvedAt
          : next.observedAt
        : (previous?.resolvedAt ?? null),
  };
}
function fingerprint(batch: ObservationBatch) {
  const { receivedAt: _received, captureId: _captureId, ...rest } = batch.envelope;
  void _received;
  void _captureId;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

/** Lab/test repository only. Production runtime always uses transactional MongoDB. */
export class MemoryObservationStore implements ObservationStore {
  readonly events = new Map<string, ObservationBatch>();
  private readonly hashes = new Map<string, string>();
  private readonly signals = new Map<string, CatalogSignal>();
  async commit(batch: ObservationBatch): Promise<'committed' | 'duplicate'> {
    const hash = fingerprint(batch);
    if (this.events.has(batch.id)) {
      if (this.hashes.get(batch.id) !== hash) throw new Error('Industrial message ID conflict');
      return 'duplicate';
    }
    this.events.set(batch.id, structuredClone(batch));
    this.hashes.set(batch.id, hash);
    for (const signal of batch.signals)
      this.signals.set(signal.id, advanceSignal(this.signals.get(signal.id), signal));
    return 'committed';
  }
  async byIds(ids: readonly string[]) {
    return [...this.signals.values()].filter((s) => ids.includes(s.id));
  }
  async history(signalId: string, before: string, limit: number, beforeEventId?: string) {
    return [...this.events.values()]
      .flatMap((b) => b.signals)
      .filter(
        (s) =>
          s.id === signalId &&
          (s.receivedAt < before ||
            (s.receivedAt === before && Boolean(beforeEventId) && s.eventId < beforeEventId!)),
      )
      .sort(
        (a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.eventId.localeCompare(a.eventId),
      )
      .slice(0, limit);
  }
  async event(eventId: string) {
    return this.events.get(eventId)?.envelope ?? null;
  }
  async list(sourceIdentity?: string, limit = 1000, targetId?: string) {
    return [...this.signals.values()]
      .filter(
        (s) =>
          (!sourceIdentity || s.sourceIdentity === sourceIdentity) &&
          (!targetId || s.targetId === targetId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}

export class MongoObservationStore implements ObservationStore {
  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
    private readonly retentionDays = 90,
  ) {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650)
      throw new Error('Invalid industrial retention days');
  }
  async initialize() {
    await this.db
      .collection('industrial_events')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.db
      .collection('industrial_signal_history')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.db.collection('industrial_sources').createIndex({ key: 1 }, { unique: true });
    await this.db.collection('industrial_events').createIndex({ eventId: 1 }, { unique: true });
    await this.db.collection('industrial_signals').createIndex({ signalId: 1 }, { unique: true });
    await this.db
      .collection('industrial_events')
      .createIndex({ sourceIdentity: 1, receivedAt: -1 });
    await this.db.collection('industrial_signals').createIndex({ sourceIdentity: 1, protocol: 1 });
    await this.db
      .collection('industrial_signal_history')
      .createIndex({ signalId: 1, observedAt: -1 });
  }
  async commit(batch: ObservationBatch): Promise<'committed' | 'duplicate'> {
    const hash = fingerprint(batch);
    const expiresAt = new Date(Date.now() + this.retentionDays * 86400000);
    const sourceKey = `${batch.envelope.protocol}:${batch.envelope.sourceIdentity}`;
    try {
      await this.db
        .collection('industrial_sources')
        .updateOne({ key: sourceKey }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000)
        throw error;
    }
    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        // A write to the source cursor serializes retries and partial updates across replicas.
        await this.db
          .collection('industrial_sources')
          .updateOne(
            { key: sourceKey },
            { $inc: { revision: 1 }, $set: { lastReceivedAt: batch.envelope.receivedAt } },
            { session },
          );
        const events = this.db.collection('industrial_events');
        const old = await events.findOne({ eventId: batch.id }, { session });
        if (old) {
          if (old.hash !== hash) throw new Error('Industrial message ID conflict');
          return 'duplicate' as const;
        }
        // Raw is a JSON string: arbitrary MQTT keys never become MongoDB update paths.
        await events.insertOne(
          {
            eventId: batch.id,
            expiresAt,
            hash,
            sourceIdentity: batch.envelope.sourceIdentity,
            protocol: batch.envelope.protocol,
            receivedAt: batch.envelope.receivedAt,
            envelopeJson: JSON.stringify(batch.envelope),
          },
          { session },
        );
        const catalog = this.db.collection('industrial_signals');
        const size = await catalog.countDocuments(
          { sourceIdentity: batch.envelope.sourceIdentity, protocol: batch.envelope.protocol },
          { session },
        );
        let added = 0;
        for (const signal of batch.signals) {
          const doc = await catalog.findOne({ signalId: signal.id }, { session });
          if (!doc && size + ++added > 10000)
            throw new Error('Industrial source catalog limit exceeded');
          const previous = doc?.signal as CatalogSignal | undefined;
          const next = advanceSignal(previous, signal);
          await catalog.updateOne(
            { signalId: signal.id },
            {
              $set: {
                sourceIdentity: signal.sourceIdentity,
                protocol: signal.protocol,
                signal: next,
              },
            },
            { upsert: true, session },
          );
          await this.db.collection('industrial_signal_history').insertOne(
            {
              signalId: signal.id,
              expiresAt,
              eventId: batch.id,
              observedAt: signal.observedAt,
              disposition:
                previous &&
                (previous.lastObservation?.observedAt ?? previous.observedAt) > signal.observedAt
                  ? 'out_of_order'
                  : 'applied',
              signal,
            },
            { session },
          );
        }
        return 'committed' as const;
      });
    } finally {
      await session.endSession();
    }
  }
  async byIds(ids: readonly string[]): Promise<CatalogSignal[]> {
    const rows = await this.db
      .collection('industrial_signals')
      .find({ signalId: { $in: [...ids] } })
      .toArray();
    return rows.map((row) => row.signal as CatalogSignal);
  }
  async history(
    signalId: string,
    before: string,
    limit: number,
    beforeEventId?: string,
  ): Promise<Signal[]> {
    const rows = await this.db
      .collection('industrial_signal_history')
      .find({
        signalId,
        $or: [
          { 'signal.receivedAt': { $lt: before } },
          ...(beforeEventId
            ? [{ 'signal.receivedAt': before, eventId: { $lt: beforeEventId } }]
            : []),
        ],
      })
      .sort({ 'signal.receivedAt': -1, eventId: -1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => row.signal as Signal);
  }
  async event(eventId: string) {
    const row = await this.db.collection('industrial_events').findOne({ eventId });
    return row ? (JSON.parse(row.envelopeJson as string) as ObservationBatch['envelope']) : null;
  }
  async list(sourceIdentity?: string, limit = 1000, targetId?: string): Promise<CatalogSignal[]> {
    const rows = await this.db
      .collection('industrial_signals')
      .find({
        ...(sourceIdentity ? { sourceIdentity } : {}),
        ...(targetId ? { 'signal.targetId': targetId } : {}),
      })
      .sort({ signalId: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => row.signal as CatalogSignal);
  }
}
