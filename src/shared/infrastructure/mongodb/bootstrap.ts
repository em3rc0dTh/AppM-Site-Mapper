import type { Db } from 'mongodb';

export async function ensurePersistenceIndexes(database: Db): Promise<void> {
  const topology = database.collection('topology_nodes');

  await Promise.all([
    topology.createIndex({ id: 1 }, { unique: true, name: 'uq_topology_id' }),
    topology.createIndex(
      { parentId: 1, lifecycle: 1, name: 1 },
      { name: 'ix_topology_parent_lifecycle_name' },
    ),
    topology.createIndex({ kind: 1, lifecycle: 1 }, { name: 'ix_topology_kind_lifecycle' }),
    topology.createIndex({ serialNumber: 1 }, { name: 'ix_topology_serial', sparse: true }),
  ]);

  const powerPaths = database.collection('power_paths');
  await Promise.all([
    powerPaths.createIndex({ id: 1 }, { unique: true, name: 'uq_power_path_id' }),
    powerPaths.createIndex({ sourceEntityId: 1 }, { name: 'ix_power_path_source' }),
    powerPaths.createIndex({ targetEntityId: 1 }, { name: 'ix_power_path_target' }),
  ]);

  const users = database.collection('users');
  await Promise.all([
    users.createIndex({ id: 1 }, { unique: true, name: 'uq_user_id' }),
    users.createIndex({ email: 1 }, { unique: true, name: 'uq_user_email' }),
    users.createIndex(
      { bootstrapSlot: 1 },
      {
        unique: true,
        name: 'uq_user_bootstrap_slot',
        partialFilterExpression: { bootstrapSlot: { $type: 'string' } },
      },
    ),
  ]);

  const sessions = database.collection('sessions');
  await Promise.all([
    sessions.createIndex({ id: 1 }, { unique: true, name: 'uq_session_id' }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true, name: 'uq_session_token_hash' }),
    sessions.createIndex({ userId: 1, revokedAt: 1 }, { name: 'ix_session_user_revoked' }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_session_expiry' }),
  ]);

  const authRateLimits = database.collection('auth_rate_limits');
  await Promise.all([
    authRateLimits.createIndex({ key: 1 }, { unique: true, name: 'uq_auth_rate_key' }),
    authRateLimits.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'ttl_auth_rate_expiry' },
    ),
  ]);

  const telemetrySources = database.collection('telemetry_sources');
  await Promise.all([
    telemetrySources.createIndex({ id: 1 }, { unique: true, name: 'uq_telemetry_source_id' }),
    telemetrySources.createIndex(
      { topicSource: 1 },
      { unique: true, name: 'uq_telemetry_source_topic' },
    ),
    telemetrySources.createIndex(
      { entityId: 1, enabled: 1 },
      { name: 'ix_telemetry_source_entity_enabled' },
    ),
    telemetrySources.createIndex(
      { expectedSerialNumber: 1 },
      { name: 'ix_telemetry_source_serial' },
    ),
  ]);

  const telemetryLatest = database.collection('telemetry_latest');
  await Promise.all([
    telemetryLatest.createIndex(
      { entityId: 1 },
      { unique: true, name: 'uq_telemetry_latest_entity' },
    ),
    telemetryLatest.createIndex({ sourceId: 1 }, { name: 'ix_telemetry_latest_source' }),
    telemetryLatest.createIndex(
      { observedAt: -1, receivedAt: -1 },
      { name: 'ix_telemetry_latest_recency' },
    ),
  ]);

  const telemetryOutbox = database.collection('telemetry_outbox');
  await Promise.all([
    telemetryOutbox.createIndex({ eventId: 1 }, { unique: true, name: 'uq_telemetry_event_id' }),
    telemetryOutbox.createIndex(
      { idempotencyKey: 1 },
      {
        unique: true,
        name: 'uq_telemetry_idempotency',
        partialFilterExpression: { idempotencyKey: { $type: 'string' } },
      },
    ),
    telemetryOutbox.createIndex(
      { historyState: 1, nextHistoryAttemptAt: 1, acceptedAt: 1 },
      { name: 'ix_telemetry_history_pending' },
    ),
    telemetryOutbox.createIndex(
      { historyState: 1, historyLeaseUntil: 1, acceptedAt: 1 },
      { name: 'ix_telemetry_history_lease' },
    ),
    telemetryOutbox.createIndex(
      { historyState: 1, deadLetteredAt: -1 },
      { name: 'ix_telemetry_history_dead_letter' },
    ),
    telemetryOutbox.createIndex(
      { 'sample.sourceId': 1, acceptedAt: -1 },
      { name: 'ix_telemetry_outbox_source' },
    ),
  ]);

  const telemetryQuarantine = database.collection('telemetry_quarantine');
  await Promise.all([
    telemetryQuarantine.createIndex(
      { id: 1 },
      { unique: true, name: 'uq_telemetry_quarantine_id' },
    ),
    telemetryQuarantine.createIndex(
      { receivedAt: -1 },
      { name: 'ix_telemetry_quarantine_received' },
    ),
    telemetryQuarantine.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'ttl_telemetry_quarantine_expiry' },
    ),
  ]);
}
