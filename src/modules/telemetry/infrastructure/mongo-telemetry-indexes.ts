import type { Db } from 'mongodb';

export async function ensureTelemetryMongoIndexes(database: Db): Promise<void> {
  await Promise.all([
    database.collection('telemetry_latest').createIndex(
      { entityId: 1 },
      {
        name: 'uniq_telemetry_latest_entity',
        unique: true,
      },
    ),
    database.collection('telemetry_sources').createIndex(
      { id: 1 },
      {
        name: 'uniq_telemetry_source_id',
        unique: true,
      },
    ),
    database.collection('telemetry_sources').createIndex(
      { topicSource: 1 },
      {
        name: 'uniq_telemetry_source_topic',
        unique: true,
      },
    ),
    database.collection('telemetry_outbox').createIndex(
      { eventId: 1 },
      {
        name: 'uniq_telemetry_outbox_event',
        unique: true,
      },
    ),
    database.collection('telemetry_outbox').createIndex(
      { idempotencyKey: 1 },
      {
        name: 'uniq_telemetry_outbox_idempotency',
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: 'string' } },
      },
    ),
    database.collection('telemetry_outbox').createIndex(
      { historyState: 1, nextHistoryAttemptAt: 1, acceptedAt: 1 },
      {
        name: 'telemetry_outbox_history_due',
      },
    ),
    database.collection('telemetry_quarantine').createIndex(
      { id: 1 },
      {
        name: 'uniq_telemetry_quarantine_id',
        unique: true,
      },
    ),
    database.collection('telemetry_quarantine').createIndex(
      { expiresAt: 1 },
      {
        name: 'ttl_telemetry_quarantine_expiry',
        expireAfterSeconds: 0,
      },
    ),
    database.collection('telemetry_quarantine').createIndex(
      { receivedAt: -1 },
      {
        name: 'telemetry_quarantine_recent',
      },
    ),
  ]);
}
